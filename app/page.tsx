import Image from "next/image";

export default function Home() {
  return (
    /* En tu archivo app/page.tsx */
    <a
      href="/payroll"
      className="flex h-12 items-center justify-center rounded-full border border-primary-500 px-5 text-primary-600 transition-colors hover:bg-primary-50"
    >
      Ir a Nómina
    </a>
  );
}