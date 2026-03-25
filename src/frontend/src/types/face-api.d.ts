declare module "@vladmandic/face-api" {
  export const nets: {
    tinyFaceDetector: { loadFromUri(url: string): Promise<void> };
    faceLandmark68TinyNet: { loadFromUri(url: string): Promise<void> };
    faceRecognitionNet: { loadFromUri(url: string): Promise<void> };
  };

  export class TinyFaceDetectorOptions {
    constructor(options?: { scoreThreshold?: number; inputSize?: number });
  }

  export function detectSingleFace(
    input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    options?: TinyFaceDetectorOptions,
  ): DetectionBuilder;

  interface DetectionBuilder {
    withFaceLandmarks(useTinyModel?: boolean): DetectionBuilder;
    withFaceDescriptor(): Promise<FaceDetectionWithDescriptor | undefined>;
  }

  interface FaceDetectionWithDescriptor {
    descriptor: Float32Array;
  }
}
