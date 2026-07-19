import { Fraunces } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
});

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${fraunces.variable} landing-root`}>{children}</div>;
}
