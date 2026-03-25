const CANVAS_SIZE = 64;
const BINS = 32;

// CDN list for face-api script -- tried in order
const FACEAPI_CDNS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api@1.7.13/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js",
  "https://unpkg.com/@vladmandic/face-api/dist/face-api.js",
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
];

// CDN list for model weights -- tried in order
const MODEL_URLS = [
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model",
  "https://unpkg.com/@vladmandic/face-api/model",
  "https://cdn.jsdelivr.net/npm/face-api.js/weights",
  "https://unpkg.com/face-api.js/weights",
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;
let modelLoadError: string | null = null;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faceapi: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFaceApi(): any {
  return typeof window !== "undefined" ? window.faceapi : null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadScriptWithFallback(): Promise<void> {
  let lastError: Error | null = null;
  for (const cdn of FACEAPI_CDNS) {
    try {
      await loadScript(cdn);
      // Wait up to 500ms for faceapi to initialize on window
      for (let i = 0; i < 10; i++) {
        if (getFaceApi()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (getFaceApi()) return;
    } catch (e) {
      lastError = e as Error;
    }
  }
  throw lastError ?? new Error("All face-api CDNs failed");
}

async function loadModelsFromUrl(modelUrl: string): Promise<void> {
  const api = getFaceApi();
  if (!api) throw new Error("face-api not loaded");
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(modelUrl),
    api.nets.ssdMobilenetv1.loadFromUri(modelUrl),
    api.nets.faceLandmark68Net.loadFromUri(modelUrl),
    api.nets.faceRecognitionNet.loadFromUri(modelUrl),
  ]);
}

export async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    try {
      await loadScriptWithFallback();
      let loaded = false;
      for (const modelUrl of MODEL_URLS) {
        try {
          await loadModelsFromUrl(modelUrl);
          loaded = true;
          break;
        } catch {
          // try next CDN
        }
      }
      if (loaded) {
        modelsLoaded = true;
        modelLoadError = null;
      } else {
        modelLoadError =
          "Could not load face recognition models. Using histogram fallback.";
        modelsLoading = null; // allow retry
      }
    } catch (e) {
      modelLoadError = (e as Error).message ?? "Model load failed";
      modelsLoading = null; // allow retry
    }
  })();

  return modelsLoading;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

export function getModelLoadError(): string | null {
  return modelLoadError;
}

export async function loadImageToCanvas(
  src: string,
  width = CANVAS_SIZE,
  height = CANVAS_SIZE,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Resize image to targetSize x targetSize and apply contrast normalization
 * (2nd / 98th percentile stretch) before face detection.
 */
export async function preprocessImageForFace(
  src: string,
  targetSize = 224,
): Promise<HTMLImageElement> {
  const imageData = await loadImageToCanvas(src, targetSize, targetSize);
  const data = imageData.data;

  const grayValues: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    grayValues.push(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
    );
  }
  grayValues.sort((a, b) => a - b);

  const p2 = grayValues[Math.floor(grayValues.length * 0.02)] ?? 0;
  const p98 = grayValues[Math.floor(grayValues.length * 0.98)] ?? 255;
  const range = Math.max(p98 - p2, 1);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(
      255,
      Math.max(0, Math.round(((data[i] - p2) / range) * 255)),
    );
    data[i + 1] = Math.min(
      255,
      Math.max(0, Math.round(((data[i + 1] - p2) / range) * 255)),
    );
    data[i + 2] = Math.min(
      255,
      Math.max(0, Math.round(((data[i + 2] - p2) / range) * 255)),
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);

  return loadHTMLImage(canvas.toDataURL("image/jpeg", 0.95));
}

export function extractHistogram(imageData: ImageData): number[] {
  const hist = new Array(BINS * 3).fill(0);
  const data = imageData.data;
  const pixelCount = imageData.width * imageData.height;

  for (let i = 0; i < data.length; i += 4) {
    const r = Math.floor((data[i] / 256) * BINS);
    const g = Math.floor((data[i + 1] / 256) * BINS);
    const b = Math.floor((data[i + 2] / 256) * BINS);
    hist[r]++;
    hist[BINS + g]++;
    hist[BINS * 2 + b]++;
  }

  return hist.map((v) => v / pixelCount);
}

export function histogramIntersection(h1: number[], h2: number[]): number {
  let intersection = 0;
  let sum = 0;
  for (let i = 0; i < h1.length; i++) {
    intersection += Math.min(h1[i], h2[i]);
    sum += h1[i];
  }
  return sum > 0 ? intersection / sum : 0;
}

/**
 * Apply pixel-level age progression transform.
 * ageFactor > 0 = age forward, ageFactor < 0 = de-age
 */
export function applyAgeProgression(
  imageData: ImageData,
  ageFactor: number,
): ImageData {
  const output = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  const data = output.data;

  if (ageFactor >= 0) {
    const rBoost = ageFactor * 20;
    const gReduce = ageFactor * 8;
    const brightness = ageFactor * 10;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] + rBoost + brightness * 0.3);
      data[i + 1] = Math.min(
        255,
        Math.max(0, data[i + 1] - gReduce + brightness * 0.1),
      );
      data[i + 2] = Math.min(255, data[i + 2] + brightness * 0.1);
      data[i] = Math.round(data[i] * 0.95 + 12);
      data[i + 1] = Math.round(data[i + 1] * 0.95 + 12);
      data[i + 2] = Math.round(data[i + 2] * 0.95 + 12);
    }
  } else {
    const factor = Math.abs(ageFactor);
    const bBoost = factor * 12;
    const rReduce = factor * 8;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] - rReduce));
      data[i + 1] = Math.min(255, data[i + 1] + bBoost * 0.2);
      data[i + 2] = Math.min(255, data[i + 2] + bBoost);
      data[i] = Math.round(
        Math.min(255, Math.max(0, (data[i] - 128) * 1.08 + 128)),
      );
      data[i + 1] = Math.round(
        Math.min(255, Math.max(0, (data[i + 1] - 128) * 1.08 + 128)),
      );
      data[i + 2] = Math.round(
        Math.min(255, Math.max(0, (data[i + 2] - 128) * 1.08 + 128)),
      );
    }
  }

  return output;
}

function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Distance to score:
 * <= 0.28 → 90-100 (very high confidence)
 * <= 0.42 → 65-89 (likely match)
 * <= 0.58 → 35-64 (possible)
 * > 0.58  → 0-34 (low)
 */
function distanceToScore(distance: number): number {
  if (distance <= 0.28) return Math.round(90 + ((0.28 - distance) / 0.28) * 10);
  if (distance <= 0.42) return Math.round(65 + ((0.42 - distance) / 0.14) * 24);
  if (distance <= 0.58) return Math.round(35 + ((0.58 - distance) / 0.16) * 29);
  return Math.max(0, Math.round(35 - ((distance - 0.58) / 0.42) * 35));
}

/**
 * Try multiple detection strategies to extract a face descriptor:
 * 1. TinyFaceDetector (fast, good for clear faces)
 * 2. SsdMobilenetv1 at low confidence (better recall)
 * 3. SsdMobilenetv1 with even lower threshold (last resort)
 */
async function extractFaceDescriptor(
  imgEl: HTMLImageElement,
): Promise<Float32Array | null> {
  const api = getFaceApi();
  if (!api) return null;

  const strategies = [
    () =>
      api
        .detectSingleFace(
          imgEl,
          new api.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.4,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor(),
    () =>
      api
        .detectSingleFace(
          imgEl,
          new api.SsdMobilenetv1Options({ minConfidence: 0.3 }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor(),
    () =>
      api
        .detectSingleFace(
          imgEl,
          new api.SsdMobilenetv1Options({ minConfidence: 0.15 }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor(),
    () =>
      api
        .detectSingleFace(
          imgEl,
          new api.TinyFaceDetectorOptions({
            inputSize: 608,
            scoreThreshold: 0.25,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor(),
  ];

  for (const strategy of strategies) {
    try {
      const detection = await strategy();
      if (detection?.descriptor) return detection.descriptor;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Detect whether a face is present.
 */
export async function detectFaceInImage(
  imgEl: HTMLImageElement,
): Promise<boolean> {
  const api = getFaceApi();
  if (!api) return false;
  try {
    let d = await api.detectSingleFace(
      imgEl,
      new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }),
    );
    if (!d)
      d = await api.detectSingleFace(
        imgEl,
        new api.SsdMobilenetv1Options({ minConfidence: 0.25 }),
      );
    return !!d;
  } catch {
    return false;
  }
}

async function extractDescriptorWithAgeTransform(
  imgEl: HTMLImageElement,
  ageFactor: number,
): Promise<Float32Array | null> {
  try {
    const imgData = await loadImageToCanvas(imgEl.src, 224, 224);
    const transformed = applyAgeProgression(imgData, ageFactor);
    const dataUrl = imageDataToDataUrl(transformed);
    const transformedImg = await loadHTMLImage(dataUrl);
    return extractFaceDescriptor(transformedImg);
  } catch {
    return null;
  }
}

function descriptorDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * CNN-based face match score using multiple age-progression variants.
 * Returns -1 if no face was detected in either image.
 */
async function cnnMatchScore(
  searchImg: HTMLImageElement,
  caseImg: HTMLImageElement,
): Promise<number> {
  // Extract descriptors for both images in parallel
  const [searchDesc, caseDesc] = await Promise.all([
    extractFaceDescriptor(searchImg),
    extractFaceDescriptor(caseImg),
  ]);

  // If we can't detect a face in the case photo, skip CNN for this case
  if (!caseDesc) return -1;

  // If we can't detect a face in the search image, skip CNN
  if (!searchDesc) return -1;

  const scores: number[] = [];
  const baseScore = distanceToScore(descriptorDistance(searchDesc, caseDesc));
  scores.push(baseScore);

  // Age progression variants (run in parallel)
  const [agedSearch, youngSearch, agedCase] = await Promise.all([
    extractDescriptorWithAgeTransform(searchImg, 0.6),
    extractDescriptorWithAgeTransform(searchImg, -0.5),
    extractDescriptorWithAgeTransform(caseImg, 0.6),
  ]);

  if (agedSearch)
    scores.push(distanceToScore(descriptorDistance(agedSearch, caseDesc)));
  if (youngSearch)
    scores.push(distanceToScore(descriptorDistance(youngSearch, caseDesc)));
  if (agedCase)
    scores.push(distanceToScore(descriptorDistance(searchDesc, agedCase)));

  return Math.max(...scores);
}

export async function computeMatchScore(
  searchSource: File | string,
  casePhotoUrl: string,
  onAgeProgressedDataUrl?: (dataUrl: string) => void,
): Promise<number> {
  try {
    let searchDataUrl: string;
    if (typeof searchSource === "string") {
      searchDataUrl = searchSource;
    } else {
      searchDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(searchSource);
      });
    }

    if (onAgeProgressedDataUrl) {
      const imgData = await loadImageToCanvas(
        searchDataUrl,
        CANVAS_SIZE,
        CANVAS_SIZE,
      );
      const aged = applyAgeProgression(imgData, 0.6);
      onAgeProgressedDataUrl(imageDataToDataUrl(aged));
    }

    // Compute histogram score regardless of CNN (used for ensemble or fallback)
    const [searchImageData, caseImageData] = await Promise.all([
      loadImageToCanvas(searchDataUrl),
      loadImageToCanvas(casePhotoUrl),
    ]);
    const histRaw = histogramIntersection(
      extractHistogram(searchImageData),
      extractHistogram(caseImageData),
    );
    // Histogram score normalized: intersections below 0.3 → 0, above 0.8 → 100
    const histScore = Math.max(
      0,
      Math.min(100, Math.round(((histRaw - 0.3) / 0.5) * 100)),
    );

    if (modelsLoaded) {
      const [searchImg, caseImg] = await Promise.all([
        preprocessImageForFace(searchDataUrl).catch(() =>
          loadHTMLImage(searchDataUrl),
        ),
        preprocessImageForFace(casePhotoUrl).catch(() =>
          loadHTMLImage(casePhotoUrl),
        ),
      ]);

      const cnnScore = await cnnMatchScore(searchImg, caseImg);

      if (cnnScore >= 0) {
        // Weighted ensemble: CNN (88%) + histogram (12%)
        return Math.round(cnnScore * 0.88 + histScore * 0.12);
      }

      // CNN got no face -- discount histogram heavily
      return Math.round(histScore * 0.4);
    }

    // Models not loaded -- histogram only with age variants
    const caseHist = extractHistogram(caseImageData);
    const histScores = [
      histogramIntersection(extractHistogram(searchImageData), caseHist),
      histogramIntersection(
        extractHistogram(applyAgeProgression(searchImageData, 0.6)),
        caseHist,
      ),
      histogramIntersection(
        extractHistogram(applyAgeProgression(searchImageData, -0.5)),
        caseHist,
      ),
      histogramIntersection(
        extractHistogram(searchImageData),
        extractHistogram(applyAgeProgression(caseImageData, 0.6)),
      ),
    ];

    const bestHistRaw = Math.max(...histScores);
    const rawScore = Math.max(
      0,
      Math.min(100, Math.round(((bestHistRaw - 0.3) / 0.5) * 100)),
    );
    return Math.round(rawScore * 0.4);
  } catch {
    return 0;
  }
}

export function computeFrameVariance(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;
  let sumSq = 0;
  const pixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += gray;
    sumSq += gray * gray;
  }

  const mean = sum / pixels;
  return sumSq / pixels - mean * mean;
}
