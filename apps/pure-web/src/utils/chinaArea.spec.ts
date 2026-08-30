import { describe, it, expect } from 'vitest';
import {
  convertTextToCode,
  CodeToText,
  regionData,
  regionDataPlus,
  provinceAndCityData
} from './chinaArea';

describe('convertTextToCode', () => {
  it('省市县三级拼接', () => {
    expect(convertTextToCode('北京市', '市辖区', '朝阳区')).toBe(
      '110000, 110100, 110105'
    );
  });

  it('仅省份时返回省 code', () => {
    expect(convertTextToCode('北京市', '', '')).toBe('110000');
  });

  it('"全部"选项码值为空串', () => {
    expect(convertTextToCode('北京市', '全部', '')).toBe('110000');
  });

  it('未知名返回空串', () => {
    expect(convertTextToCode('不存在省', '不存在市', '不存在区')).toBe('');
  });
});

describe('导出数据形状', () => {
  it('CodeToText 省代码映射名称', () => {
    expect(CodeToText['110000']).toBe('北京市');
    expect(CodeToText['']).toBe('全部');
  });

  it('regionData 为省市扩展结构（顶层省含 children 市）', () => {
    const bj = regionData.find(v => v.value === '110000');
    expect(bj?.label).toBe('北京市');
    expect(bj?.children?.some(c => c.value === '110100')).toBe(true);
  });

  it('regionDataPlus 首位为"全部"哨兵', () => {
    expect(regionDataPlus[0]).toMatchObject({ value: '', label: '全部' });
  });

  it('provinceAndCityData 不含区级 children', () => {
    const bj = provinceAndCityData.find(v => v.value === '110000');
    expect(bj?.children?.[0].children).toBeUndefined();
  });
});
