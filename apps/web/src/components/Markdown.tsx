import { mdToHtml } from "@/lib/markdown";

export const Markdown = ({ md }: { md: string }) => (
  <div
    className="space-y-3 text-sm leading-relaxed text-neutral-300 [&_a]:text-amber-400 [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-neutral-100 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-amber-400 [&_h3]:font-medium [&_h3]:text-neutral-100 [&_strong]:text-neutral-100 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
    dangerouslySetInnerHTML={{ __html: mdToHtml(md) }}
  />
);
