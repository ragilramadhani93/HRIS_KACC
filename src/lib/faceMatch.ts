/**
 * Browser-side face similarity using grayscale histogram comparison.
 * No external API — works entirely with Canvas.
 *
 * Strategy:
 *  1. Load both images onto an offscreen canvas
 *  2. Crop to the centre 70% (rough face region)
 *  3. Build a normalised 64-bin grayscale histogram for each
 *  4. Compute Bhattacharyya coefficient (0–1, higher = more similar)
 *  5. Scale to a 0–100 confidence score
 */

const THUMB = 64; // resize to 64×64 before comparing
const BINS  = 64;

async function loadImageData(src: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Only request cross-origin for http(s) URLs. Local storage photos are
    // data-URLs (same-origin); setting crossOrigin on those makes the browser
    // reject them as CORS failures, so matches would always score 0.
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = THUMB;
      c.height = THUMB;
      const ctx = c.getContext('2d')!;
      // Draw centre-crop: use middle 70% of the original
      const cropX = img.naturalWidth  * 0.15;
      const cropY = img.naturalHeight * 0.10;
      const cropW = img.naturalWidth  * 0.70;
      const cropH = img.naturalHeight * 0.80;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, THUMB, THUMB);
      resolve(ctx.getImageData(0, 0, THUMB, THUMB));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function histogram(data: ImageData): Float32Array {
  const hist = new Float32Array(BINS);
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const bin  = Math.min(BINS - 1, Math.floor((gray / 255) * BINS));
    hist[bin]++;
  }
  // normalise
  const total = THUMB * THUMB;
  for (let i = 0; i < BINS; i++) hist[i] /= total;
  return hist;
}

/** Bhattacharyya coefficient: 1 = identical, 0 = completely different */
function bhattacharyya(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < BINS; i++) sum += Math.sqrt(a[i] * b[i]);
  return Math.min(1, sum);
}

/** Compare a captured Blob against one reference URL. Returns 0–100. */
async function compareImages(capturedBlob: Blob, referenceUrl: string): Promise<number> {
  const capturedUrl = URL.createObjectURL(capturedBlob);
  try {
    const [capturedData, refData] = await Promise.all([
      loadImageData(capturedUrl),
      loadImageData(referenceUrl),
    ]);
    if (!capturedData || !refData) return 0;
    const sim = bhattacharyya(histogram(capturedData), histogram(refData));
    // Bhattacharyya ranges ~0.7–1.0 in practice for faces; scale to 0–100
    // 0.70 → 0, 1.0 → 100
    return Math.max(0, Math.min(100, ((sim - 0.70) / 0.30) * 100));
  } finally {
    URL.revokeObjectURL(capturedUrl);
  }
}

export interface FaceProfile {
  id: string;
  employee_id: string;
  photo_front_url: string | null;
  photo_left_url:  string | null;
  photo_right_url: string | null;
  employee?: unknown;
}

export interface MatchResult {
  profile: FaceProfile;
  confidence: number; // 0–100
}

/**
 * Find the best-matching profile from a list.
 * Compares captured photo against all 3 reference angles and averages the top scores.
 */
export async function findBestMatch(
  capturedBlob: Blob,
  profiles: FaceProfile[],
): Promise<MatchResult | null> {
  if (!profiles.length) return null;

  const results = await Promise.all(
    profiles.map(async (p) => {
      const urls = [p.photo_front_url, p.photo_left_url, p.photo_right_url].filter(Boolean) as string[];
      if (!urls.length) return { profile: p, confidence: 0 };

      const scores = await Promise.all(urls.map((u) => compareImages(capturedBlob, u)));
      // Use the best angle score (most likely to match one angle well)
      const best = Math.max(...scores);
      return { profile: p, confidence: parseFloat(best.toFixed(2)) };
    }),
  );

  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}
