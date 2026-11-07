-- 设备第三态：注销 / 撤销不物理删除档案（D5 §2.1）。
--
-- 只有一条纯增量的 ALTER TYPE——不改写已有行，可在非空库上执行。
-- 迁移文件刻意不引用新值：同一事务里刚加进枚举的值不可用。
ALTER TYPE "IotDeviceStatus" ADD VALUE 'RETIRED';
