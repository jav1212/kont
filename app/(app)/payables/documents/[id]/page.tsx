import { PayablesDocumentDetail } from "@/src/modules/payables/frontend/payables-document-detail";

/** Shows one payable document with its applications, installments and due-date history.
 * @param props - Route parameters containing the document identifier.
 * @returns The payable document page.
 */
export default async function PayablesDocumentPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  return <PayablesDocumentDetail documentId={decodeURIComponent(id)} />;
}
