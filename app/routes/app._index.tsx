import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const notes = await prisma.note.findMany({ orderBy: { createdAt: "desc" } });
  return { notes };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const text = formData.get("text") as string;

  if (!text?.trim()) return { error: "Note cannot be empty." };

  await prisma.note.create({ data: { text } });
  return { success: true };
};

export default function Index() {
  const { notes } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [text, setText] = useState("");

  const isLoading = fetcher.state !== "idle";
  const saved = fetcher.data && "success" in fetcher.data;
  const error = fetcher.data && "error" in fetcher.data ? (fetcher.data as any).error : null;

  const handleSave = () => {
    fetcher.submit({ text }, { method: "POST" });
    if (saved) setText("");
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
          {error && (
            <s-banner tone="critical">
              <s-paragraph>{error}</s-paragraph>
            </s-banner>
          )}
          {saved && (
            <s-banner tone="success">
              <s-paragraph>Note saved successfully!</s-paragraph>
            </s-banner>
          )}
          <s-button
            onClick={handleSave}
            variant="primary"
            {...(isLoading ? { loading: true } : {})}
          >
            Save to DB
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Saved Notes">
        {notes.length === 0 ? (
          <s-paragraph>No notes yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {notes.map((note: { id: number; text: string; createdAt: string }) => (
              <s-box key={note.id} padding="base" borderWidth="base" borderRadius="base">
                <s-paragraph>{note.text}</s-paragraph>
                <s-text tone="neutral">
                  {new Date(note.createdAt).toLocaleString()}
                </s-text>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Stats">
        <s-paragraph>
          <s-text>Total Reviews: </s-text>
          <s-text>0</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Rewards Given: </s-text>
          <s-text>0</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Notes Saved: </s-text>
          <s-text>{notes.length}</s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
