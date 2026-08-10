import { http } from '@/utils/http';

type Result = {
  code: number;
  message: string;
  data: Array<any>;
};

/** 文件上传 */
export const formUpload = data => {
  return http.request<Result>(
    'post',
    'https://pureadmin.free.beeceptor.com/images',
    { data },
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
};
