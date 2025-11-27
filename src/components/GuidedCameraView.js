import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  VisionCameraProxy,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import Svg, { Circle, Polygon } from 'react-native-svg';
import { runOnJS } from 'react-native-worklets-core';

/* global __detectFace */
let detectFace = null;

try {
  if (VisionCameraProxy?.getInstance) {
    const proxy = VisionCameraProxy.getInstance();
    detectFace = proxy?.getFrameProcessorPlugin('detectFace');
  } else if (VisionCameraProxy?.getFrameProcessorPlugin) {
    detectFace = VisionCameraProxy.getFrameProcessorPlugin('detectFace');
  }
} catch (error) {
  console.warn('VisionCameraProxy 초기화 실패:', error);
}

if (!detectFace && typeof __detectFace !== 'undefined') {
  detectFace = __detectFace;
}

export const isMediaPipeReady = () => !!detectFace;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const GUIDES = {
  upper: {
    title: '윗니 촬영',
    instruction: '입을 크게 벌리고\n윗니가 선명하게 보이도록 해주세요',
    emoji: '🦷',
  },
  lower: {
    title: '아랫니 촬영',
    instruction: '입을 크게 벌리고\n아랫니가 선명하게 보이도록 해주세요',
    emoji: '🦷',
  },
  front: {
    title: '앞니 촬영',
    instruction: '활짝 웃으면서\n앞니가 선명하게 보이도록 해주세요',
    emoji: '😁',
  },
};

const DEFAULT_LIP_SERVER_URL = 'http://192.168.0.61:8000/detect-lips';

export default function GuidedCameraView({
  imageType,
  onCapture,
  onClose,
  enableAutoCapture = true,
  autoCaptureInterval = 1000,
  lipServerUrl = DEFAULT_LIP_SERVER_URL,
}) {
  const device = useCameraDevice('front');
  const camera = useRef(null);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [isReady, setIsReady] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lipLandmarks, setLipLandmarks] = useState([]);
  const lastLogTime = useRef(0);
  const frameCountRef = useRef(0);
  const lastFrameProcessorLog = useRef(0);
  const autoCaptureTimerRef = useRef(null);
  const autoCaptureInFlight = useRef(false);

  const guide = GUIDES[imageType] || GUIDES.front;

  useEffect(() => {
    console.log('🚀 GuidedCameraView 마운트 - 이미지 타입:', imageType);
    console.log('📱 카메라 디바이스:', device ? '✅ 사용 가능' : '❌ 없음');
    if (device) {
      console.log('카메라 정보 - ID:', device.id, '위치:', device.position);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.log('🔌 detectFace 플러그인 상태:', detectFace ? '✅ 준비됨' : '❌ 없음');
  }, []);

  const updateLipLandmarks = useCallback((points) => {
    const now = Date.now();
    if (now - lastLogTime.current > 1000) {
      console.log('👄 입술 랜드마크 업데이트:', points.length, '개 포인트');
      if (points.length > 0) {
        console.log('첫 번째 포인트:', points[0]);
      }
      lastLogTime.current = now;
    }
    setLipLandmarks(points);
  }, []);

  const logFrameProcessorEvent = useCallback((payload) => {
    frameCountRef.current += 1;
    const now = Date.now();
    if (now - lastFrameProcessorLog.current > 1000) {
      console.log(
        `🎯 FrameProcessor #${frameCountRef.current}`,
        JSON.stringify(payload),
      );
      lastFrameProcessorLog.current = now;
    }
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsReady(true);
    console.log('✅ 카메라 준비 완료');
  }, []);

  useEffect(() => {
    if (!detectFace) {
      console.warn('⚠️ detectFace 플러그인을 사용할 수 없습니다');
      console.warn('MediaPipe Frame Processor가 제대로 빌드되었는지 확인하세요');
    } else {
      console.log('✅ detectFace 플러그인 로드 성공');
    }
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';

    try {
      if (!detectFace) {
        return;
      }

      const result = detectFace(frame);

      if (result && result.lipPoints && result.lipPoints.length > 0) {
        const lipPoints = result.lipPoints;

        const fWidth = frame.width;
        const fHeight = frame.height;

        const scaleX = SCREEN_WIDTH / fWidth;
        const scaleY = SCREEN_HEIGHT / fHeight;

        // 🔧 좌우 반전 제거: 그냥 스케일만 적용
        const transformedPoints = lipPoints.map((point) => ({
          x: point.x * scaleX,
          y: point.y * scaleY,
        }));

        runOnJS(updateLipLandmarks)(transformedPoints);
        runOnJS(logFrameProcessorEvent)({
          source: 'frameProcessor',
          width: fWidth,
          height: fHeight,
          lipPointCount: lipPoints.length,
          faceDetected: result.faceDetected,
        });
      } else {
        runOnJS(logFrameProcessorEvent)({
          source: 'frameProcessor',
          width: frame.width,
          height: frame.height,
          lipPointCount: 0,
          faceDetected: result?.faceDetected ?? false,
        });
      }
    } catch (e) {
      console.log('❗ Frame Processor 오류:', e);
      runOnJS(logFrameProcessorEvent)({
        source: 'frameProcessor',
        error: e?.message ?? 'unknown',
      });
    }
  }, [logFrameProcessorEvent, updateLipLandmarks]);

  useEffect(() => {
    console.log('📹 카메라 권한 상태:', hasPermission ? '✅ 허용됨' : '⚠️ 없음');
    if (!hasPermission) {
      console.log('🔑 카메라 권한 요청 중...');
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('🎬 카메라 활성화');
      setIsCameraActive(true);
    }, 100);

    return () => {
      clearTimeout(timer);
      console.log('🛑 카메라 비활성화');
      setIsCameraActive(false);
    };
  }, []);

  const uploadLipPhoto = useCallback(
    async (fileAsset) => {
      if (!lipServerUrl) {
        console.warn('⚠️ lipServerUrl 설정이 없어 업로드를 건너뜁니다');
        return;
      }

      try {
        console.log('🌐 입술 서버 업로드 시작:', lipServerUrl);
        const payload = new FormData();
        payload.append('file', fileAsset);

        const response = await fetch(lipServerUrl, {
          method: 'POST',
          body: payload,
        });

        const json = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(json?.error || `HTTP ${response.status}`);
        }

        console.log('✅ 입술 서버 응답:', json);

        if (json?.lipPoints?.length && json.width && json.height) {
          const fWidth = json.width;
          const fHeight = json.height;

          const scaleX = SCREEN_WIDTH / fWidth;
          const scaleY = SCREEN_HEIGHT / fHeight;

          // 🔧 서버 응답도 좌우 반전 제거
          const transformed = json.lipPoints.map((p) => ({
            x: p.x * scaleX,
            y: p.y * scaleY,
          }));

          console.log('🎨 서버 기반 입술 포인트 변환:', transformed.length);
          setLipLandmarks(transformed);
        } else {
          console.log('ℹ️ 서버 응답에 유효한 lipPoints가 없습니다');
        }
      } catch (error) {
        console.warn('⚠️ 입술 서버 업로드 실패:', error?.message ?? error);
      }
    },
    [lipServerUrl],
  );

  const capturePhoto = useCallback(
    async ({ notifyParent = false } = {}) => {
      console.log(
        '📸 촬영 시도 - 카메라 준비:',
        isReady,
        '카메라 ref:',
        !!camera.current,
      );

      if (!camera.current || !isReady) {
        console.warn('⚠️ 촬영 불가 - 카메라가 준비되지 않음');
        return null;
      }

      try {
        // 옵션 최소화: 가장 안정적인 기본 촬영
        const photo = await camera.current.takePhoto({
          enableShutterSound: false, // 📵 촬영 시 셔터음 비활성화 (지원 플랫폼 한정)
        });

        console.log('📸 촬영 성공, 결과:', photo);

        const uri =
          photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
        const asset = {
          uri,
          type: 'image/jpeg',
          name: `dental_${imageType}_${Date.now()}.jpg`,
        };

        if (notifyParent && onCapture) {
          console.log('📤 촬영 데이터 전달:', asset);
          onCapture(asset);
        }

        await uploadLipPhoto(asset);
        return asset;
      } catch (error) {
        console.error('❌ 촬영 오류:', error);
        return null;
      }
    },
    [imageType, isReady, onCapture, uploadLipPhoto],
  );

  const takePhoto = useCallback(() => {
    capturePhoto({ notifyParent: true });
  }, [capturePhoto]);

  const triggerAutoCapture = useCallback(async () => {
    if (autoCaptureInFlight.current) {
      return;
    }

    autoCaptureInFlight.current = true;
    try {
      await capturePhoto({ notifyParent: false });
    } finally {
      autoCaptureInFlight.current = false;
    }
  }, [capturePhoto]);

  useEffect(() => {
    const canAutoCapture =
      enableAutoCapture && isReady && isCameraActive && hasPermission && !!lipServerUrl;

    if (!canAutoCapture) {
      if (autoCaptureTimerRef.current) {
        clearInterval(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
        console.log('⏹️ 자동 촬영 중지');
      }
      return undefined;
    }

    console.log('♻️ 자동 촬영 시작 - 주기(ms):', autoCaptureInterval);
    autoCaptureTimerRef.current = setInterval(triggerAutoCapture, autoCaptureInterval);

    return () => {
      if (autoCaptureTimerRef.current) {
        clearInterval(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
        console.log('⏹️ 자동 촬영 종료');
      }
    };
  }, [
    autoCaptureInterval,
    enableAutoCapture,
    hasPermission,
    isCameraActive,
    isReady,
    lipServerUrl,
    triggerAutoCapture,
  ]);

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={styles.permissionButton}
        >
          <Text style={styles.permissionButtonText}>권한 허용</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>카메라를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        photo={true}
        pixelFormat="yuv"
        frameProcessor={frameProcessor}
        onInitialized={handleCameraReady}
        onError={(error) => {
          console.error('Camera error:', error);
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
        }}
      />

      {lipLandmarks.length > 0 && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {lipLandmarks.length > 3 && (
            <Polygon
              points={lipLandmarks.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(59, 130, 246, 0.3)"
              stroke="#3b82f6"
              strokeWidth={2}
            />
          )}

          {lipLandmarks.map((point, index) => (
            <Circle
              key={`lip-${index}`}
              cx={point.x}
              cy={point.y}
              r={3}
              fill="#10b981"
              opacity={0.8}
            />
          ))}
        </Svg>
      )}

      <View style={styles.topContainer}>
        <View style={styles.guideBox}>
          <Text style={styles.guideEmoji}>{guide.emoji}</Text>
          <Text style={styles.guideTitle}>{guide.title}</Text>
          <Text style={styles.guideInstruction}>{guide.instruction}</Text>
        </View>
      </View>

      <View style={styles.debugContainer}>
        <Text style={styles.debugText}>카메라: {isReady ? '✅' : '⏳'}</Text>
        <Text style={styles.debugText}>
          입술 포인트: {lipLandmarks.length}개
        </Text>
      </View>

      <View style={styles.bottomContainer}>
        {isReady ? (
          <>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={takePhoto}
              style={styles.captureButton}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>

            <View style={styles.guideToggleButton}>
              <Text style={styles.guideToggleText}>가이드</Text>
            </View>
          </>
        ) : (
          <View style={styles.loadingIndicator}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.loadingText}>준비 중...</Text>
          </View>
        )}
      </View>

      <View style={styles.tipsContainer}>
        <Text style={styles.tipsText}>💡 화면 중앙에 입을 맞춰주세요</Text>
        <Text style={styles.tipsText}>
          🤖 화면 속 입 모양에 맞춰 파란 점이 그려집니다
        </Text>
        <Text style={styles.tipsText}>
          📸 촬영 버튼을 눌러 원하는 타이밍에 촬영하세요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  permissionText: {
    color: 'white',
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIndicator: {
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 12,
    fontSize: 14,
  },
  topContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  guideBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: SCREEN_WIDTH * 0.8,
  },
  guideEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  guideTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  guideInstruction: {
    color: '#d1d5db',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
    zIndex: 10,
  },
  closeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#3b82f6',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3b82f6',
  },
  guideToggleButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideToggleText: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
  },
  tipsContainer: {
    position: 'absolute',
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 12,
    borderRadius: 12,
    zIndex: 5,
  },
  tipsText: {
    color: 'white',
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  debugContainer: {
    position: 'absolute',
    top: 120,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 12,
    borderRadius: 8,
    zIndex: 100,
  },
  debugText: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
});
