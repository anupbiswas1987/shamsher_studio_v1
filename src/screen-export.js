export const SCREEN_EXPORT={width:1080,height:1920,fps:30,videoBitsPerSecond:10000000,audioBitsPerSecond:192000};
// Explicit AVC + AAC only: a generic MP4 type may select different codecs.
export const SCREEN_MP4_TYPES=[
 'video/mp4;codecs=avc1.640028,mp4a.40.2',
 'video/mp4;codecs=avc1.4d4028,mp4a.40.2',
 'video/mp4;codecs=avc1.424028,mp4a.40.2',
 'video/mp4;codecs=avc1,mp4a.40.2',
];
export function screenExportMime(recorder=globalThis.MediaRecorder){return SCREEN_MP4_TYPES.find(type=>recorder?.isTypeSupported(type))||null;}
export function screenRecordingMime(recorder=globalThis.MediaRecorder){
 return screenExportMime(recorder)||['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(type=>recorder?.isTypeSupported(type))||null;
}
