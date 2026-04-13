import { useState, useRef } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { uploadToR2 } from "../r2.server";
import { Resend } from "resend";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const notes = await prisma.note.findMany({ orderBy: { createdAt: "desc" } });
  return { notes };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "upload") {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { uploadError: "No file selected." };
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(buffer, file.name, file.type);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "amgst99@gmail.com",
      subject: "New file uploaded — Reviews & Rewards",
      html: `
        <h2>New file uploaded</h2>
        <p><strong>File name:</strong> ${file.name}</p>
        <p><strong>File type:</strong> ${file.type}</p>
        <p><strong>URL:</strong> <a href="${url}">${url}</a></p>
      `,
    });

    console.log("Resend response:", JSON.stringify({ data, error }));

    return { uploadedUrl: url, emailError: error?.message ?? null };
  }

  const text = formData.get("text") as string;
  if (!text?.trim()) return { error: "Note cannot be empty." };
  await prisma.note.create({ data: { text } });
  return { success: true };
};

export default function Index() {
  const { notes } = useLoaderData<typeof loader>();
  const noteFetcher = useFetcher<typeof action>();
  const uploadFetcher = useFetcher<typeof action>();
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const noteLoading = noteFetcher.state !== "idle";
  const uploadLoading = uploadFetcher.state !== "idle";
  const noteSaved = noteFetcher.data && "success" in noteFetcher.data;
  const noteError = noteFetcher.data && "error" in noteFetcher.data ? (noteFetcher.data as any).error : null;
  const uploadedUrl = uploadFetcher.data && "uploadedUrl" in uploadFetcher.data ? (uploadFetcher.data as any).uploadedUrl : null;
  const uploadError = uploadFetcher.data && "uploadError" in uploadFetcher.data ? (uploadFetcher.data as any).uploadError : null;
  const emailError = uploadFetcher.data && "emailError" in uploadFetcher.data ? (uploadFetcher.data as any).emailError : null;

  const handleSaveNote = () => {
    noteFetcher.submit({ text }, { method: "POST" });
  };

  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("intent", "upload");
    formData.append("file", file);
    uploadFetcher.submit(formData, { method: "POST", encType: "multipart/form-data" });
  };

  return (
    <s-page heading="Welcome to Doomlings">
      <s-section heading="Reviews & Rewards App">
        <s-paragraph>
          Manage your customer reviews and reward loyal shoppers — all from one place.
        </s-paragraph>
      </s-section>

      <s-section heading="DB Test — Save a Note">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Note"
            value={text}
            onInput={(e: any) => setText(e.target.value)}
            placeholder="Type something to save..."
          />
          {noteError && (
            <s-banner tone="critical"><s-paragraph>{noteError}</s-paragraph></s-banner>
          )}
          {noteSaved && (
            <s-banner tone="success"><s-paragraph>Note saved successfully!</s-paragraph></s-banner>
          )}
          <s-button onClick={handleSaveNote} variant="primary" {...(noteLoading ? { loading: true } : {})}>
            Save to DB
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="R2 Test — Upload a File">
        <s-stack direction="block" gap="base">
          <input ref={fileInputRef} type="file" accept="image/*,video/*" />
          {uploadError && (
            <s-banner tone="critical"><s-paragraph>{uploadError}</s-paragraph></s-banner>
          )}
          {uploadedUrl && (
            <s-stack direction="block" gap="base">
              <s-banner tone="success"><s-paragraph>Uploaded successfully!</s-paragraph></s-banner>
              {emailError && (
                <s-banner tone="warning"><s-paragraph>Email error: {emailError}</s-paragraph></s-banner>
              )}
              <s-paragraph>
                URL: <a href={uploadedUrl} target="_blank" rel="noreferrer">{uploadedUrl}</a>
              </s-paragraph>
              {uploadedUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) && (
                <img src={uploadedUrl} alt="Uploaded" style={{ maxWidth: "300px", borderRadius: "8px" }} />
              )}
            </s-stack>
          )}
          <s-button onClick={handleUpload} variant="primary" {...(uploadLoading ? { loading: true } : {})}>
            Upload to R2
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Saved Notes">
        {notes.length === 0 ? (
          <s-paragraph>No notes yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {notes.map((note: { id: number; text: string; createdAt: Date }) => (
              <s-box key={note.id} padding="base" borderWidth="base" borderRadius="base">
                <s-paragraph>{note.text}</s-paragraph>
                <s-text tone="neutral">{new Date(note.createdAt).toLocaleString()}</s-text>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Stats">
        <s-paragraph>
          <s-text>Total Reviews: </s-text><s-text>0</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Rewards Given: </s-text><s-text>0</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Notes Saved: </s-text><s-text>{notes.length}</s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
