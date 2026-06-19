// §8.4：时间以 UTC 存储、展示层按 locale 格式化（日期/数字/货币/时区）。

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDateTime(utcIso: string, locale: string): string {
  return new Date(utcIso).toLocaleString(locale);
}
