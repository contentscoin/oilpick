// 수동 벤더 — deno.land/std·jsr.io 접근이 막힌 샌드박스에서도 `deno test`가 돌도록
// @std/assert(0.224.0)의 사용 서브셋만 로컬 고정한 것(F14-①에서 도입).
// 시그니처와 "실패 시 AssertionError throw" 계약을 원본과 동일하게 유지한다.
// deepEqual은 원시값(0/-0 동등·NaN 동등 포함)·배열·평범한 객체·Date·RegExp·URL·Map·Set을
// 원본과 같은 의미로 비교한다. 그 외 내장 타입 비교가 필요해지면 여기에 같은 계약으로 추가할 것.
// 실패 메시지는 Deno.inspect 기반 — 순환 참조·함수 프로퍼티가 있어도 안전하게 출력된다.

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export function assert(expr: unknown, msg = "단언 실패"): asserts expr {
  if (!expr) throw new AssertionError(msg);
}

function deepEqual(a: unknown, b: unknown): boolean {
  // 원본 equal()과 동일: 0 === -0 은 동등, NaN 끼리도 동등.
  if (a === b || Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && String(a) === String(b);
  }
  if (a instanceof URL || b instanceof URL) {
    return a instanceof URL && b instanceof URL && a.href === b.href;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    const rest = [...b];
    return [...a].every((av) => {
      const i = rest.findIndex((bv) => deepEqual(av, bv));
      if (i === -1) return false;
      rest.splice(i, 1);
      return true;
    });
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    const rest = [...b.entries()];
    return [...a.entries()].every(([ak, av]) => {
      const i = rest.findIndex(([bk, bv]) => deepEqual(ak, bk) && deepEqual(av, bv));
      if (i === -1) return false;
      rest.splice(i, 1);
      return true;
    });
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (k) =>
      Object.hasOwn(b as object, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** 순환 참조·함수 프로퍼티에도 안전한 값 표시(원본 format()의 Deno.inspect 사용을 따름). */
function format(v: unknown): string {
  return Deno.inspect(v, { depth: 10, colors: false, compact: true });
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      msg ?? `값이 다릅니다.\nactual:   ${format(actual)}\nexpected: ${format(expected)}`,
    );
  }
}

// deno-lint-ignore no-explicit-any
type ErrorCtor<E extends Error> = new (...args: any[]) => E;

function checkError<E extends Error>(
  err: unknown,
  ErrorClass: ErrorCtor<E> | undefined,
  msgIncludes: string | undefined,
  label: string,
): E {
  if (!(err instanceof Error)) {
    throw new AssertionError(`${label}: Error가 아닌 값이 throw됨: ${format(err)}`);
  }
  if (ErrorClass && !(err instanceof ErrorClass)) {
    throw new AssertionError(
      `${label}: ${ErrorClass.name} 대신 ${err.constructor.name}이(가) throw됨: ${err.message}`,
    );
  }
  if (msgIncludes && !err.message.includes(msgIncludes)) {
    throw new AssertionError(`${label}: 메시지에 "${msgIncludes}" 미포함: ${err.message}`);
  }
  return err as E;
}

export function assertThrows<E extends Error = Error>(
  fn: () => unknown,
  ErrorClass?: ErrorCtor<E>,
  msgIncludes?: string,
): E {
  let caught: unknown;
  let threw = false;
  try {
    fn();
  } catch (err) {
    caught = err;
    threw = true;
  }
  if (!threw) throw new AssertionError("assertThrows: throw가 발생하지 않음");
  return checkError(caught, ErrorClass, msgIncludes, "assertThrows");
}

export async function assertRejects<E extends Error = Error>(
  fn: () => Promise<unknown>,
  ErrorClass?: ErrorCtor<E>,
  msgIncludes?: string,
): Promise<E> {
  let caught: unknown;
  let rejected = false;
  try {
    await fn();
  } catch (err) {
    caught = err;
    rejected = true;
  }
  if (!rejected) throw new AssertionError("assertRejects: reject가 발생하지 않음");
  return checkError(caught, ErrorClass, msgIncludes, "assertRejects");
}
