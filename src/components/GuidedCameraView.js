import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 각 치아 타입별 가이드라인 정의
const GUIDES = {
  upper: {
    title: '윗니 촬영',
    instruction: '입을 크게 벌리고\n윗니가 선명하게 보이도록 해주세요',
    emoji: '🦷',
    mouthShape: 'open_up', // 입을 벌리고 위쪽 보이기
  },
  lower: {
    title: '아랫니 촬영',
    instruction: '입을 크게 벌리고\n아랫니가 선명하게 보이도록 해주세요',
    emoji: '🦷',
    mouthShape: 'open_down', // 입을 벌리고 아래쪽 보이기
  },
  front: {
    title: '앞니 촬영',
    instruction: '활짝 웃으면서\n앞니가 선명하게 보이도록 해주세요',
    emoji: '😁',
    mouthShape: 'smile', // 웃는 표정
  },
};

export default function GuidedCameraView({ imageType, onCapture, onClose }) {
  const device = useCameraDevice('front');
  const camera = useRef(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [showGuide, setShowGuide] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const guide = GUIDES[imageType] || GUIDES.front;

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    // 카메라 활성화
    setIsCameraActive(true);
    
    return () => {
      setIsCameraActive(false);
    };
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsReady(true);
  }, []);

  const takePhoto = useCallback(async () => {
    if (!camera.current || !isReady) {
      return;
    }

    try {
      setCountdown(3);
      
      // 3초 카운트다운
      for (let i = 3; i > 0; i--) {
        setCountdown(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setCountdown(null);

      const photo = await camera.current.takePhoto({
        flash: 'off',
        qualityPrioritization: 'quality',
      });

      onCapture({
        uri: Platform.OS === 'android' ? `file://${photo.path}` : photo.path,
        type: 'image/jpeg',
        name: `dental_${imageType}_${Date.now()}.jpg`,
      });
    } catch (error) {
      console.error('사진 촬영 오류:', error);
    }
  }, [isReady, imageType, onCapture]);

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
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
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        photo={true}
        onInitialized={handleCameraReady}
        onError={(error) => {
          console.error('Camera error:', error);
        }}
      />

      {/* 가이드 오버레이 - View 기반 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* 어두운 배경 */}
        <View style={styles.overlay} />
        
        {/* 타원형 가이드 */}
        <View style={styles.guideOval}>
          <View style={styles.guideOvalInner} />
        </View>
      </View>

      {/* 상단 안내 */}
      <View style={styles.topContainer}>
        <View style={styles.guideBox}>
          <Text style={styles.guideEmoji}>{guide.emoji}</Text>
          <Text style={styles.guideTitle}>{guide.title}</Text>
          <Text style={styles.guideInstruction}>{guide.instruction}</Text>
        </View>
      </View>

      {/* 카운트다운 표시 */}
      {countdown && (
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

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
              disabled={countdown !== null}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowGuide(!showGuide)}
              style={styles.guideToggleButton}
            >
              <Text style={styles.guideToggleText}>{showGuide ? '가이드 숨김' : '가이드 표시'}</Text>
            </TouchableOpacity>
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
        <Text style={styles.tipsText}>💡 파란색 타원 안에 입을 맞춰주세요</Text>
        <Text style={styles.tipsText}>📸 촬영 버튼을 누르면 3초 후 자동 촬영됩니다</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  guideOval: {
    position: 'absolute',
    top: SCREEN_HEIGHT / 2 - (SCREEN_HEIGHT * 0.15),
    left: SCREEN_WIDTH / 2 - (SCREEN_WIDTH * 0.35),
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_HEIGHT * 0.3,
    borderRadius: (SCREEN_WIDTH * 0.7) / 2,
    borderWidth: 3,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  guideOvalInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: (SCREEN_WIDTH * 0.7) / 2,
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
  countdownContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 100,
  },
  countdownText: {
    color: 'white',
    fontSize: 120,
    fontWeight: '700',
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
});

