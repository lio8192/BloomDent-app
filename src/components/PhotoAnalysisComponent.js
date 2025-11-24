import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadImage } from '../services/api';
import { getUser } from '../utils/storage';
import GuidedCameraView from './GuidedCameraView';

const IMAGE_TYPES = [
  { id: 'upper', label: '윗니', emoji: '🦷', key: 'upper' },
  { id: 'lower', label: '아랫니', emoji: '🦷', key: 'lower' },
  { id: 'front', label: '앞니', emoji: '😁', key: 'front' },
];

export default function PhotoAnalysisComponent({ onReset }) {
  const [capturedImages, setCapturedImages] = useState({
    upper: null,
    lower: null,
    front: null,
  });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const [showImageTypes, setShowImageTypes] = useState(false);
  const [activeCamera, setActiveCamera] = useState(null); // null | 'upper' | 'lower' | 'front'

  const resetState = useCallback(() => {
    setCapturedImages({
      upper: null,
      lower: null,
      front: null,
    });
    setAnalysisResult(null);
    setIsAnalyzing(false);
    setPickerError(null);
    setShowImageTypes(false);
    setActiveCamera(null);
    onReset?.();
  }, [onReset]);

  const allImagesCaputred = capturedImages.upper && capturedImages.lower && capturedImages.front;

  const uploadAllImagesAndAnalyze = useCallback(async () => {
    setAnalysisResult(null);
    setIsAnalyzing(true);
    setPickerError(null);

    try {
      // 사용자 정보 가져오기
      const user = await getUser();
      
      if (!user || !user.id) {
        setPickerError('로그인이 필요합니다.');
        setIsAnalyzing(false);
        return;
      }

      // 세 개의 이미지를 모두 업로드
      const uploadPromises = [
        uploadImage(capturedImages.upper.uri, user.id, 'upper'),
        uploadImage(capturedImages.lower.uri, user.id, 'lower'),
        uploadImage(capturedImages.front.uri, user.id, 'front'),
      ];

      const responses = await Promise.all(uploadPromises);

      // 모든 업로드가 성공했는지 확인
      const allSuccess = responses.every(res => res.success);

      if (allSuccess) {
        // 마지막 응답의 AI 분석 결과 사용 (또는 통합 결과)
        const lastResponse = responses[responses.length - 1];
        const aiResult = lastResponse.data?.ai_result;
        
        if (aiResult) {
          setAnalysisResult({
            score: aiResult.overall_score || 0,
            issues: aiResult.findings?.map(finding => ({
              type: finding.severity === 'high' ? 'warning' : 
                    finding.severity === 'medium' ? 'info' : 'good',
              text: finding.description,
            })) || [],
            recommendations: aiResult.recommendations || [],
          });
        } else {
          // AI 결과가 없는 경우 기본 메시지
          setAnalysisResult({
            score: 0,
            issues: [
              { type: 'info', text: 'AI 분석이 진행 중입니다. 잠시 후 다시 확인해주세요.' },
            ],
            recommendations: ['윗니, 아랫니, 앞니 사진이 모두 업로드되었습니다.'],
          });
        }
      } else {
        const failedUploads = responses.filter(res => !res.success);
        setPickerError(`${failedUploads.length}개의 이미지 업로드에 실패했습니다.`);
      }
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
      setPickerError(error.message || '이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [capturedImages]);

  const handlePickerResult = useCallback(
    (response, imageType) => {
      if (!response || response.didCancel) {
        return;
      }

      if (response.errorCode) {
        setPickerError(
          response.errorMessage || '사진을 불러오는 중 문제가 발생했습니다. 다시 시도해주세요.'
        );
        return;
      }

      const asset = response.assets?.[0];

      if (!asset?.uri) {
        setPickerError('선택한 사진의 경로를 확인할 수 없습니다.');
        return;
      }

      setPickerError(null);
      setCapturedImages(prev => ({
        ...prev,
        [imageType]: asset,
      }));
    },
    []
  );

  const handleLaunch = useCallback(
    async (type, imageType) => {
      if (type === 'camera') {
        // 가이드 카메라 열기
        setActiveCamera(imageType);
      } else {
        // 앨범에서 선택
        const options = {
          mediaType: 'photo',
          quality: 0.8,
        };

        try {
          const response = await launchImageLibrary(options);
          handlePickerResult(response, imageType);
        } catch (error) {
          setPickerError('사진을 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
      }
    },
    [handlePickerResult]
  );

  const handleCameraCapture = useCallback((photo, imageType) => {
    setActiveCamera(null);
    setCapturedImages(prev => ({
      ...prev,
      [imageType]: photo,
    }));
  }, []);

  const handleCameraClose = useCallback(() => {
    setActiveCamera(null);
  }, []);

  const handleImageTypePress = useCallback((imageType) => {
    Alert.alert('사진 선택', '가이드 카메라로 촬영하거나 앨범에서 선택해주세요.', [
      { text: '앨범에서 선택', onPress: () => handleLaunch('library', imageType) },
      { text: '가이드 카메라 촬영', onPress: () => handleLaunch('camera', imageType) },
      { text: '취소', style: 'cancel' },
    ]);
  }, [handleLaunch]);

  const handleStartCapture = useCallback(() => {
    setShowImageTypes(true);
  }, []);

  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 상태 초기화
      resetState();
    };
  }, [resetState]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {!analysisResult ? (
          <View style={styles.photoUploadSection}>
            <View style={styles.cameraIcon}>
              <Text style={styles.cameraIconText}>📷</Text>
            </View>
            <Text style={styles.photoTitle}>구강 사진을 촬영해주세요</Text>
            <Text style={styles.photoSubtext}>
              윗니, 아랫니, 앞니를 모두 촬영하면 AI가 분석해드립니다
            </Text>

            {!showImageTypes ? (
              <TouchableOpacity onPress={handleStartCapture} style={styles.uploadButton}>
                <Text style={styles.uploadButtonText}>📤 사진 촬영 시작</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.imageTypesContainer}>
                {IMAGE_TYPES.map((imageType) => {
                  const isCaptured = capturedImages[imageType.key];
                  return (
                    <TouchableOpacity
                      key={imageType.id}
                      onPress={() => handleImageTypePress(imageType.key)}
                      style={[
                        styles.imageTypeButton,
                        isCaptured && styles.imageTypeButtonCaptured,
                      ]}
                    >
                      <Text style={styles.imageTypeEmoji}>{imageType.emoji}</Text>
                      <Text style={styles.imageTypeLabel}>{imageType.label}</Text>
                      {isCaptured && (
                        <View style={styles.checkBadge}>
                          <Text style={styles.checkIcon}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {allImagesCaputred && (
                  <TouchableOpacity
                    onPress={uploadAllImagesAndAnalyze}
                    style={styles.analyzeButton}
                    disabled={isAnalyzing}
                  >
                    <Text style={styles.analyzeButtonText}>
                      {isAnalyzing ? '업로드 중...' : '🔍 분석 시작하기'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={resetState} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>
              </View>
            )}

            {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
          </View>
        ) : (
          <View style={styles.analysisSection}>
            <View style={styles.photoPreviewContainer}>
              <Text style={styles.photoPreviewTitle}>촬영된 사진</Text>
              <View style={styles.photoPreviewGrid}>
                {IMAGE_TYPES.map((imageType) => (
                  <View key={imageType.id} style={styles.photoPreviewItem}>
                    <Image
                      source={{ uri: capturedImages[imageType.key]?.uri }}
                      style={styles.photoPreviewImage}
                    />
                    <Text style={styles.photoPreviewLabel}>{imageType.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {isAnalyzing ? (
              <View style={styles.loadingSection}>
                <Text style={styles.loadingText}>AI 분석 중...</Text>
              </View>
            ) : (
              <View style={styles.resultSection}>
                <View style={styles.scoreSection}>
                  <Text style={styles.scoreNumber}>{analysisResult.score}</Text>
                  <Text style={styles.scoreLabel}>구강 건강 점수</Text>
                </View>

                <View style={styles.issuesSection}>
                  {analysisResult.issues.map((issue, index) => (
                    <View key={index} style={styles.issueItem}>
                      <Text style={styles.issueIcon}>
                        {issue.type === 'good' ? '✅' : issue.type === 'warning' ? '⚠️' : 'ℹ️'}
                      </Text>
                      <Text style={styles.issueText}>{issue.text}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.recommendationsSection}>
                  <Text style={styles.recommendationsTitle}>추천 사항</Text>
                  {analysisResult.recommendations.map((rec, index) => (
                    <View key={index} style={styles.recommendationItem}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.recommendationText}>{rec}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity onPress={resetState} style={styles.resetButton}>
                  <Text style={styles.resetButtonText}>다시 분석하기</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 가이드 카메라 모달 */}
      <Modal
        visible={activeCamera !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCameraClose}
      >
        {activeCamera && (
          <GuidedCameraView
            imageType={activeCamera}
            onCapture={(photo) => handleCameraCapture(photo, activeCamera)}
            onClose={handleCameraClose}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    flex: 1,
    padding: 24,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  photoUploadSection: {
    alignItems: 'center',
  },
  cameraIcon: {
    width: 80,
    height: 80,
    backgroundColor: '#dbeafe',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cameraIconText: {
    fontSize: 40,
  },
  photoTitle: {
    color: '#374151',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  photoSubtext: {
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  uploadButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  imageTypesContainer: {
    width: '100%',
    gap: 12,
    marginTop: 12,
  },
  imageTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  imageTypeButtonCaptured: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  imageTypeEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  imageTypeLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#10b981',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  analyzeButton: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  analyzeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    color: '#ef4444',
  },
  analysisSection: {
    gap: 16,
  },
  photoPreviewContainer: {
    marginBottom: 8,
  },
  photoPreviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  photoPreviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  photoPreviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  photoPreviewImage: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  photoPreviewLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  loadingSection: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  resultSection: {
    gap: 16,
  },
  scoreSection: {
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#2563eb',
  },
  scoreLabel: {
    color: '#6b7280',
    marginTop: 4,
  },
  issuesSection: {
    gap: 8,
  },
  issueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
  },
  issueIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  issueText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  recommendationsSection: {
    marginTop: 16,
  },
  recommendationsTitle: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bullet: {
    color: '#3b82f6',
    marginRight: 8,
  },
  recommendationText: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  resetButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  resetButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
  },
});
