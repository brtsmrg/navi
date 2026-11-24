/** Where the free on-phone voice model comes from (downloaded once, then kept on the phone). */
export const MODEL_URL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx';
export const VOICE_URL = (id: string) => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${id}.bin`;
export const MODEL_MB = 92;
