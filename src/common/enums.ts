// src/common/enums.ts
export enum UserType { YUNO = 'YUNO', MERCHANT = 'MERCHANT' }

export enum TxStatus {
  APPROVED = 'approved',
  DECLINED = 'declined',
  ERROR = 'error',
  TIMEOUT = 'timeout',
}

export enum TxErrorType {
  PROVIDER_DOWN = 'provider_down',
  NETWORK = 'network',
  CONFIG = 'config',
  TIMEOUT = 'timeout',
}