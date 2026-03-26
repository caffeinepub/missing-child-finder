# Missing Child Finder

## Current State
- Face detection uses face-api.js (TinyFaceDetector + SsdMobilenetv1) with 7-strategy pipeline
- `useActor` does NOT wrap `_initializeAccessControlWithSecret` in try-catch -- actor fails to load when canister restarts
- `useActor` does NOT return `isError` or `refetch` -- Retry button silently does nothing
- Registration button is disabled when actor is null (even after canister restart)
- Face matching sometimes shows wrong children because detection fails and histogram fallback matches by color

## Requested Changes (Diff)

### Add
- BlazeFace detector via TensorFlow.js CDN (`@tensorflow/tfjs` + `@tensorflow-models/blazeface`) as a new face detection layer
- When BlazeFace detects a face bounding box, crop the image to that region and run face-api.js on the crop for better descriptor quality
- Add BlazeFace as additional strategy in the 7-strategy pipeline (now 8+ strategies)

### Modify
- `useActor.ts`: Wrap `_initializeAccessControlWithSecret` in try-catch so actor always loads even on canister restart
- `useActor.ts`: Return `isError` and `refetch` from the hook
- `imageAnalysis.ts`: Add BlazeFace loading and integration into `extractFaceDescriptor`
- `imageAnalysis.ts`: When BlazeFace finds a face, crop to that face region and run face-api.js on the cropped region at full size (512x512)

### Remove
- Nothing

## Implementation Plan
1. Fix `useActor.ts`: wrap init call in try-catch, return `isError` and `refetch`
2. In `imageAnalysis.ts`, add BlazeFace CDN loader (TF.js + BlazeFace model)
3. Add BlazeFace as a face detection strategy: detect face bounding box, crop image, run face-api.js descriptor on crop
4. Integrate BlazeFace into the existing multi-strategy pipeline as an additional strategy
5. If BlazeFace detects a face but face-api.js still can't detect on the crop, try face-api.js directly on the full image as existing fallback
