/** 최소 classnames 헬퍼. 외부 의존성(clsx 등) 추가 없이 falsy 값만 걸러낸다. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
