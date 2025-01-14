import { expect } from 'chai';

export function shouldEqualIgnoreCase(a: string, b: string) {
  expect(a.toLowerCase()).to.be.equal(b.toLowerCase());
}

export async function shouldFailWithError(promise: Promise<any>, err: string) {
  return await expect(promise).to.be.eventually.rejectedWith(err);
}

export async function shouldFulfill(
  publicClient: waitForable,
  promise: Promise<any>
) {
  const hash = await expect(promise).to.be.eventually.fulfilled;
  return await publicClient.waitForTransactionReceipt({ hash });
}

export type waitForable = {
  waitForTransactionReceipt(arg: { hash: string }): Promise<any>;
};
