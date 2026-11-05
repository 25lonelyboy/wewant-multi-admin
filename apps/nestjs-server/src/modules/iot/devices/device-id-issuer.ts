import { Injectable } from '@nestjs/common';
import { issueDeviceId } from '@multi-admin/device-registry';

/**
 * 设备标识签发口。
 *
 * 单独成 provider 是为了让 e2e 能覆盖成确定性序列——随机签发时，“手工占住同名子表”
 * 这类用例没有可复现的靶子。
 */
@Injectable()
export class DeviceIdIssuer {
  issue(): string {
    return issueDeviceId();
  }
}
