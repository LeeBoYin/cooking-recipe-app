// 測試用：vitest 的 `?raw` 匯入（把來源文件讀成文字）
declare module '*.md?raw' {
  const text: string;
  export default text;
}
