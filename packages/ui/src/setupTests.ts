import "@testing-library/jest-dom/vitest";

// jsdom(25.x)은 URL.createObjectURL/revokeObjectURL을 구현하지 않는다.
// PhotoUploader가 파일 선택 시 미리보기 URL을 만들 때 이 API를 호출하므로 테스트 환경에서
// 최소 스텁을 제공한다(실제 브라우저에서는 네이티브 구현이 쓰인다).
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:mock-url";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}

