import { formatN } from "@/src/shared/frontend/utils/pdf-chrome";

export const formatPayrollAmount = (n: number, dec = 2): string => formatN(n, dec);
