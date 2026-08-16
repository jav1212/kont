import { classNames } from "./internal/class-names.js";
import "flag-icons/css/flag-icons.min.css";

export interface CurrencyFlagProps {
  readonly currency: string;
  readonly className?: string;
}

const currencyCountries: Readonly<Record<string, string>> = Object.freeze({
  AED: "AE", ANG: "CW", ARS: "AR", AUD: "AU", BOB: "BO", BRL: "BR",
  CAD: "CA", CHF: "CH", CLP: "CL", CNY: "CN", COP: "CO", CRC: "CR",
  CUC: "CU", CUP: "CU", CZK: "CZ", DKK: "DK", DOP: "DO", EGP: "EG",
  EUR: "EU", GBP: "GB", GTQ: "GT", HKD: "HK", HNL: "HN", HUF: "HU",
  IDR: "ID", ILS: "IL", INR: "IN", JPY: "JP", KRW: "KR", MXN: "MX",
  MXP: "MX", MYR: "MY", NIO: "NI", NOK: "NO", NZD: "NZ", PAB: "PA",
  PEN: "PE", PHP: "PH", PLN: "PL", PYG: "PY", RUB: "RU", SAR: "SA",
  SEK: "SE", SGD: "SG", THB: "TH", TRY: "TR", TTD: "TT", UYU: "UY",
  VES: "VE", VND: "VN", ZAR: "ZA", USD: "US",
});

export function CurrencyFlag({ className, currency }: CurrencyFlagProps) {
  const country = currencyCountries[currency.toUpperCase()];
  return <span className={classNames("kt-currency-flag", country && "fi", country && `fi-${country.toLowerCase()}`, className)} aria-hidden="true">
    {country ? null : currency.slice(0, 2).toUpperCase()}
  </span>;
}
