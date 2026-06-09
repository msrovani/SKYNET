import { useState, useEffect } from 'react';

export type TvPlatform = 'tizen' | 'webos' | 'android-tv' | 'roku' | 'browser' | 'unknown';

export interface TvCapabilities {
  platform: TvPlatform;
  webgpu: boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  isTv: boolean;
  inputType: 'remote' | 'touch' | 'gamepad' | 'keyboard';
}

function detectTvPlatform(): TvPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (ua.includes('Web0S') || ua.includes('LG')) return 'webos';
  if (typeof (window as any).tizen !== 'undefined') return 'tizen';
  if (ua.includes('Android TV') || ua.includes('AFT')) return 'android-tv';
  if (ua.includes('Roku') || ua.includes('RokuTV')) return 'roku';
  return 'browser';
}

function detectInputType(): 'remote' | 'touch' | 'gamepad' | 'keyboard' {
  if (typeof navigator === 'undefined') return 'keyboard';
  const ua = navigator.userAgent || '';
  if (ua.includes('TV') || ua.includes('Web0S') || typeof (window as any).tizen !== 'undefined') return 'remote';
  if (typeof navigator.maxTouchPoints !== 'undefined' && navigator.maxTouchPoints > 2) return 'touch';
  return 'keyboard';
}

export function useTvPlatform(): TvCapabilities {
  const [caps, setCaps] = useState<TvCapabilities>(() => ({
    platform: 'unknown',
    webgpu: false,
    screenWidth: 0,
    screenHeight: 0,
    pixelRatio: 1,
    isTv: false,
    inputType: 'keyboard',
  }));

  useEffect(() => {
    const platform = detectTvPlatform();
    const isTv = platform !== 'browser' && platform !== 'unknown';
    const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const inputType = detectInputType();

    setCaps({
      platform,
      webgpu,
      screenWidth: window.screen?.width ?? 0,
      screenHeight: window.screen?.height ?? 0,
      pixelRatio: window.devicePixelRatio ?? 1,
      isTv,
      inputType,
    });
  }, []);

  return caps;
}
