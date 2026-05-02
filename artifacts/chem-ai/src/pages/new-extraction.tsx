import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProject,
  useAddSourceDocument,
  useCreateExtraction,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  UploadCloud,
  FileText,
  Loader2,
} from "lucide-react";

const MAX_BYTES = 10 * 1024 * 1024;

export default function NewExtraction() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("paste");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createProject = useCreateProject();
  const addSource = useAddSourceDocument();
  const createExtraction = useCreateExtraction();

  const isBusy =
    createProject.isPending ||
    addSource.isPending ||
    createExtraction.isPending;

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Max upload size is 10 MB.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setUploadedFile({ name: file.name, content: text });
    };
    reader.onerror = () => {
      toast({
        title: "Failed to read file",
        description: "Try a plain .txt file or paste the text directly.",
        variant: "destructive",
      });
    };
    reader.readAsText(file);
  }

  async function handleExtract() {
    const isUpload = activeTab === "upload";
    const sourceContent = isUpload
      ? (uploadedFile?.content ?? "")
      : pastedText;

    if (!sourceContent.trim()) {
      toast({
        title: "No source provided",
        description: isUpload
          ? "Upload a .txt file first."
          : "Paste source text first.",
        variant: "destructive",
      });
      return;
    }

    const fallbackTitle = isUpload
      ? (uploadedFile?.name ?? "Untitled extraction")
      : (sourceContent.split(/\r?\n/).find((l) => l.trim()) ??
          "Untitled extraction"
        ).slice(0, 80);

    const projectName = title.trim() || fallbackTitle;

    try {
      const project = await createProject.mutateAsync({
        data: { name: projectName, description: "" },
      });

      await addSource.mutateAsync({
        projectId: project.id,
        data: {
          kind: isUpload ? "pdf" : "text",
          filename: isUpload ? (uploadedFile?.name ?? null) : null,
          content: sourceContent,
        },
      });

      await createExtraction.mutateAsync({
        projectId: project.id,
        data: {},
      });

      await queryClient.invalidateQueries({
        queryKey: getListProjectsQueryKey(),
      });

      toast({
        title: "Extraction complete",
        description: `Created model card for "${projectName}".`,
      });

      navigate(`/model-cards/${project.id}`);
    } catch (err) {
      toast({
        title: "Extraction failed",
        description:
          err instanceof Error
            ? err.message
            : "Unknown error talking to the API.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">
          New Extraction
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload a published paper or paste scientific text to extract model
          artifacts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Extraction Source</CardTitle>
              <CardDescription>
                Provide the source material for the model extraction.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  setActiveTab(v === "upload" ? "upload" : "paste")
                }
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="upload" data-testid="tab-upload">
                    Upload Document
                  </TabsTrigger>
                  <TabsTrigger value="paste" data-testid="tab-paste">
                    Paste Text
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="upload">
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="dropzone-upload"
                  >
                    {uploadedFile ? (
                      <>
                        <FileText className="h-10 w-10 text-primary mb-4" />
                        <h3 className="text-lg font-semibold">
                          {uploadedFile.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {uploadedFile.content.length.toLocaleString()}{" "}
                          characters loaded — click to replace
                        </p>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">
                          Click to upload a text file
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          .txt only for now — paste PDF text on the other tab
                          (max 10 MB)
                        </p>
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      ref={fileInputRef}
                      accept=".txt,text/plain"
                      data-testid="input-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="paste">
                  <div className="space-y-4">
                    <Label htmlFor="raw-text">Raw Scientific Text</Label>
                    <Textarea
                      id="raw-text"
                      placeholder="Paste methodology sections, equations, or parameter tables here…"
                      className="min-h-[300px] font-mono text-sm"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      data-testid="input-paste-text"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Extraction Settings</CardTitle>
              <CardDescription>
                Provider: <span className="font-mono">mock</span> — real
                providers ship in a future milestone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Project title (optional)</Label>
                <Input
                  id="title"
                  placeholder="e.g. CSTR isothermal model"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-title"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to derive from the source.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full h-12 text-lg font-semibold"
                size="lg"
                onClick={handleExtract}
                disabled={isBusy}
                data-testid="btn-extract"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  "Extract Model"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
