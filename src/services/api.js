// API 기본 설정
const API_BASE_URL = 'http://210.119.33.3:3000/api';

// 공통 fetch 함수
export const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  // 토큰이 있으면 헤더에 추가 (나중에 JWT 토큰 사용 시)
  const token = await import('../utils/storage').then(m => m.getToken());
  if (token) {
    defaultHeaders.Authorization = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw {
        status: response.status,
        message: data.message || '요청 처리 중 오류가 발생했습니다.',
        data: data,
      };
    }

    return data;
  } catch (error) {
    // 네트워크 오류 처리
    if (error.message === 'Network request failed') {
      throw {
        status: 0,
        message: '네트워크 연결을 확인해주세요.',
        data: null,
      };
    }
    throw error;
  }
};

// GET 요청
export const get = (endpoint, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'GET',
  });
};

// POST 요청
export const post = (endpoint, body, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  });
};

// PUT 요청
export const put = (endpoint, body, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  });
};

// DELETE 요청
export const del = (endpoint, options = {}) => {
  return apiRequest(endpoint, {
    ...options,
    method: 'DELETE',
  });
};

// 이미지 업로드 (multipart/form-data)
export const uploadImage = async (imageUri, userId, imageType = 'front') => {
  const url = `${API_BASE_URL}/images/upload`;
  
  // FormData 생성
  const formData = new FormData();
  
  // 이미지 파일 추가
  const filename = imageUri.split('/').pop();
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  
  formData.append('image', {
    uri: imageUri,
    name: filename,
    type: type,
  });
  
  // user_id 추가
  formData.append('user_id', userId.toString());
  
  // image_type 추가
  formData.append('image_type', imageType);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw {
        status: response.status,
        message: data.message || '이미지 업로드 중 오류가 발생했습니다.',
        data: data,
      };
    }

    return data;
  } catch (error) {
    if (error.message === 'Network request failed') {
      throw {
        status: 0,
        message: '네트워크 연결을 확인해주세요.',
        data: null,
      };
    }
    throw error;
  }
};

