import type { NextFunction, Request, Response } from 'express';
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware
} from './request-id.middleware.js';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as Request;
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, setHeader, next };
}

describe('requestIdMiddleware', () => {
  it('无上游头时生成 UUID 并写入 req 与响应头', () => {
    const { req, res, setHeader, next } = mockReqRes();
    requestIdMiddleware(req, res, next);
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('透传上游传入的 requestId', () => {
    const { req, res, setHeader, next } = mockReqRes({
      [REQUEST_ID_HEADER]: 'upstream-123'
    });
    requestIdMiddleware(req, res, next);
    expect(req.requestId).toBe('upstream-123');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'upstream-123');
  });
});
