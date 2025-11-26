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
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import Svg, { Circle, Polygon } from 'react-native-svg';
import { runOnJS } from 'react-native-worklets-core';

// Frame Processor 플러그인 타입 정의
// eslint-disable-next-line no-undef
const detectFace = typeof __detectFace !== 'undefined' ? __detectFace : null;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 각 치아 타입별 가이드라인 정의
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

export default function GuidedCameraView({ imageType, onCapture, onClose }) {
  const device = useCameraDevice('front');
  const camera = useRef(null);
  const { hasPermission, requestPermission } = useCameraPermission();

  const [isReady, setIsReady] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lipLandmarks, setLipLandmarks] = useState([]);

  const guide = GUIDES[imageType] || GUIDES.front;

  // 입술 랜드마크를 JS 스레드에서 업데이트하는 함수
  const updateLipLandmarks = useCallback((points) => {
    setLipLandmarks(points);
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsReady(true);
    console.log('✅ 카메라 준비 완료');
  }, []);

  // 실시간 Frame Processor로 입술 감지
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    try {
      if (!detectFace) {
        return;
      }
      
      // Frame Processor 플러그인 호출
      const result = detectFace(frame);
      
      if (result && result.lipPoints && result.lipPoints.length > 0) {
        const lipPoints = result.lipPoints;
        
        // 프레임 크기
        const fWidth = frame.width;
        const fHeight = frame.height;
        
        // 좌표 변환: 카메라 프레임 -> 화면 좌표
        // 전면 카메라는 좌우 반전되므로 X 좌표를 미러링
        const scaleX = SCREEN_WIDTH / fWidth;
        const scaleY = SCREEN_HEIGHT / fHeight;
        
        const transformedPoints = lipPoints.map((point) => ({
          x: SCREEN_WIDTH - (point.x * scaleX), // 좌우 반전
          y: point.y * scaleY,
        }));
        
        // JS 스레드로 전달
        runOnJS(updateLipLandmarks)(transformedPoints);
      } else {
        runOnJS(updateLipLandmarks)([]);
      }
    } catch (e) {
      console.log('Frame Processor 오류:', e);
    }
  }, [updateLipLandmarks]);

  // 권한 요청
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // 카메라 활성/비활성 관리
  useEffect(() => {
    setIsCameraActive(true);
    return () => setIsCameraActive(false);
  }, []);

  // 촬영(수동만)
  const takePhoto = useCallback(async () => {
    if (!camera.current || !isReady) return;

    try {
      const photo = await camera.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'quality',
      });

      // file:// URL 형식으로 변환
      const uri = photo.path.startsWith('file://') 
        ? photo.path 
        : `file://${photo.path}`;

      onCapture({
        uri,
        type: 'image/jpeg',
        name: `dental_${imageType}_${Date.now()}.jpg`,
      });
    } catch (e) {
      console.error('촬영 오류:', e);
    }
  }, [isReady, imageType, onCapture]);

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
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>카메라를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 카메라 프리뷰 */}
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        photo={true}
        frameProcessor={frameProcessor}
        onInitialized={handleCameraReady}
        onError={(error) => console.error('Camera error:', error)}
      />

      {/* 입술 랜드마크 SVG 오버레이 */}
      {lipLandmarks.length > 0 && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* 입술 영역을 반투명 폴리곤으로 채우기 */}
          {lipLandmarks.length > 3 && (
            <Polygon
              points={lipLandmarks.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(59, 130, 246, 0.3)"
              stroke="#3b82f6"
              strokeWidth={2}
            />
          )}

          {/* 입술 포인트들을 작은 점으로 표시 (디버깅용) */}
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

      {/* 상단 안내 박스 */}
      <View style={styles.topContainer}>
        <View style={styles.guideBox}>
          <Text style={styles.guideEmoji}>{guide.emoji}</Text>
          <Text style={styles.guideTitle}>{guide.title}</Text>
          <Text style={styles.guideInstruction}>{guide.instruction}</Text>
        </View>
      </View>

      {/* 디버그: 입술 포인트 개수만 간단히 표시 */}
      <View style={styles.debugContainer}>
        <Text style={styles.debugText}>카메라: {isReady ? '✅' : '⏳'}</Text>
        <Text style={styles.debugText}>
          입술 포인트: {lipLandmarks.length}개
        </Text>
      </View>

      {/* 하단 컨트롤 */}
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

      {/* 팁 안내 */}
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
