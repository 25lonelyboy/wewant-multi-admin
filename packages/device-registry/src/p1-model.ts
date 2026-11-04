import { AGGREGATES, type ModelDeclaration } from './model-types.js';
import { P1_MODEL_CODE } from './p1.js';

/**
 * P1 的物模型：三个数值测点，各声明四类聚合。
 *
 * ⚠️ 量程与 `apps/iot-worker` 的 `DEFAULT_METRIC_RANGES` 同值但**不共用**——那是应用层常量，
 * 包不能反向依赖。S5 让 worker 从模型取量程之后，那份常量退场，这里成为唯一来源。
 */
export const P1_MODEL: ModelDeclaration = {
  modelCode: P1_MODEL_CODE,
  properties: [
    {
      key: 'temperature',
      kind: 'float',
      unit: '°C',
      range: { min: -50, max: 200 },
      aggregates: AGGREGATES
    },
    {
      key: 'vibration',
      kind: 'float',
      unit: 'mm/s',
      range: { min: 0, max: 100 },
      aggregates: AGGREGATES
    },
    {
      key: 'current',
      kind: 'float',
      unit: 'A',
      range: { min: 0, max: 100 },
      aggregates: AGGREGATES
    }
  ],
  services: [],
  events: []
};
