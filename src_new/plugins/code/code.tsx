// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import type * as MonacoTypes from "monaco-editor/esm/vs/editor/editor.api";
import { clsx } from "clsx";
import { If } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import Split from "react-split-it";
import loader from "@monaco-editor/loader";
import { adaptFromReactOrNativeKeyEvent } from "@/utils/keyutil";

const codeCache = new Map<string, string>();

// TODO: need to update these on theme change (pull from CSS vars)
document.addEventListener("DOMContentLoaded", () => {
    loader.config({ paths: { vs: "./node_modules/monaco-editor/min/vs" } });
    loader.init().then(() => {
        monaco.editor.defineTheme("wave-theme-dark", {
            base: "hc-black",
            inherit: true,
            rules: [],
            colors: {
                "editor.background": "#000000",
            },
        });

        monaco.editor.defineTheme("wave-theme-light", {
            base: "hc-light",
            inherit: true,
            rules: [],
            colors: {
                "editor.background": "#fefefe",
            },
        });
    });
});

function renderCmdText(text: string): any {
    return <span>&#x2318;{text}</span>;
}

// there is a global monaco variable (TODO get the correct TS type)
declare var monaco: any;

const CodeKeybindings: React.FC<{
    codeObject: { registerKeybindings: () => void; unregisterKeybindings: () => void };
}> = ({ codeObject }) => {
    React.useEffect(() => {
        codeObject.registerKeybindings();
        return () => codeObject.unregisterKeybindings();
    }, [codeObject]);

    return null;
};

export const SourceCodeRenderer: React.FC<{
    data: ExtBlob;
    cmdstr: string;
    cwd: string;
    readOnly: boolean;
    notFound: boolean;
    exitcode: number;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
    scrollToBringIntoViewport: () => void;
    lineState: LineStateType;
    isSelected: boolean;
    shouldFocus: boolean;
    rendererApi: RendererModelContainerApi;
}> = (props) => {
    const { data, cmdstr, cwd, readOnly, notFound, exitcode, context, opts, savedHeight, scrollToBringIntoViewport, lineState, isSelected, shouldFocus, rendererApi } = props;
    const [code, setCode] = React.useState<string | null>(null);
    const [languages, setLanguages] = React.useState<string[]>([]);
    const [selectedLanguage, setSelectedLanguage] = React.useState("");
    const [isSave, setIsSave] = React.useState(false);
    const [isClosed, setIsClosed] = React.useState(lineState["prompt:closed"]);
    const [editorHeight, setEditorHeight] = React.useState(Math.max(savedHeight - (GlobalModel.lineHeightEnv.lineHeight + 11), 0));
    const [message, setMessage] = React.useState<{ status: "success" | "error"; text: string } | null>(null);
    const [isPreviewerAvailable, setIsPreviewerAvailable] = React.useState(false);
    const [showPreview, setShowPreview] = React.useState(lineState["showPreview"]);
    const [editorFraction, setEditorFraction] = React.useState(lineState["editorFraction"] || 0.5);
    const [showReadonly, setShowReadonly] = React.useState(false);

    const monacoEditor = React.useRef<MonacoTypes.editor.IStandaloneCodeEditor>(null);
    const markdownRef = React.useRef<HTMLDivElement>(null);
    const syncing = React.useRef(false);
    const originalCode = React.useRef<string>("");
    const filePath = lineState["prompt:file"];
    const cacheKey = `${context.screenId}-${context.lineId}-${filePath}`;

    React.useEffect(() => {
        const cachedCode = codeCache.get(cacheKey);
        if (cachedCode) {
            setCode(cachedCode);
        } else {
            data.text().then((text) => {
                originalCode.current = text;
                setCode(text);
                codeCache.set(cacheKey, text);
            });
        }
    }, [data, cacheKey]);

    const saveLineState = (kvp) => {
        GlobalCommandRunner.setLineState(context.screenId, context.lineId, { ...lineState, ...kvp }, false);
    };

    const setInitialLanguage = (editor) => {
        const langs = monaco.languages.getLanguages().map((lang) => lang.id);
        setLanguages(langs);
        let detectedLanguage = lineState["lang"];
        if (!detectedLanguage) {
            const strForFilePath = filePath || cmdstr;
            const extension = RegExp(/(?:[^\\/:*?"<>|\r\n]+\.)([a-zA-Z0-9]+)\b/).exec(strForFilePath)?.[1] || "";
            const detectedLanguageObj = monaco.languages.getLanguages().find((lang) => lang.extensions?.includes("." + extension));
            if (detectedLanguageObj) {
                detectedLanguage = detectedLanguageObj.id;
                saveLineState({ lang: detectedLanguage });
            }
        }
        if (detectedLanguage) {
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, detectedLanguage);
                setSelectedLanguage(detectedLanguage);
                setIsPreviewerAvailable(["markdown", "mdx"].includes(detectedLanguage));
            }
        }
    };

    const doSave = (onSave = () => {}) => {
        if (!isSave) return;
        const encodedCode = new TextEncoder().encode(code);
        GlobalModel.writeRemoteFile(context.screenId, context.lineId, filePath, encodedCode, { useTemp: true })
            .then(() => {
                originalCode.current = code;
                setIsSave(false);
                setMessage({ status: "success", text: `Saved to ${cwd}/${filePath}` });
                onSave();
                setTimeout(() => setMessage(null), 3000);
            })
            .catch((e) => {
                setMessage({ status: "error", text: e.message });
                setTimeout(() => setMessage(null), 3000);
            });
    };

    const doClose = () => {
        if (isSave) {
            return GlobalModel.showAlert({
                message: "Do you want to Save your changes before closing?",
                confirm: true,
            }).then((result) => {
                if (result) return doSave(doClose);
                setCode(originalCode.current);
                setIsSave(false);
                doClose();
            });
        }
        GlobalCommandRunner.setLineState(context.screenId, context.lineId, { ...lineState, "prompt:closed": true }, false)
            .then(() => {
                setIsClosed(true);
                setMessage({ status: "success", text: `Closed. This editor is now read-only` });
                setShowReadonly(true);
                setTimeout(() => updateEditorHeight(), 100);
                setTimeout(() => setMessage(null), 3000);
            })
            .catch((e) => {
                setMessage({ status: "error", text: e.message });
                setTimeout(() => setMessage(null), 3000);
            });
        if (shouldFocus) {
            GlobalCommandRunner.screenSetFocus("input");
        }
    };

    const togglePreview = () => {
        const newShowPreview = !showPreview;
        setShowPreview(newShowPreview);
        saveLineState({ showPreview: newShowPreview });
        setTimeout(() => updateEditorOpts(), 0);
    };

    const registerKeybindings = () => {
        const domain = `code-${context.lineId}`;
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("plugin", domain, "codeedit:save", () => {
            doSave();
            return true;
        });
        keybindManager.registerKeybinding("plugin", domain, "codeedit:close", () => {
            doClose();
            return true;
        });
        keybindManager.registerKeybinding("plugin", domain, "codeedit:togglePreview", () => {
            togglePreview();
            return true;
        });
    };

    const unregisterKeybindings = () => {
        GlobalModel.keybindManager.unregisterDomain(`code-${context.lineId}`);
    };

    const handleEditorDidMount = (editor: MonacoTypes.editor.IStandaloneCodeEditor, monaco: Monaco) => {
        monacoEditor.current = editor;
        setInitialLanguage(editor);
        updateEditorHeight();
        setTimeout(() => {
            const opts = getEditorOptions();
            editor.updateOptions(opts);
        }, 2000);
        editor.onKeyDown((e: MonacoTypes.IKeyboardEvent) => {
            const waveEvent = adaptFromReactOrNativeKeyEvent(e.browserEvent);
            if (GlobalModel.keybindManager.checkKeysPressed(waveEvent, ["codeedit:save", "codeedit:close", "codeedit:togglePreview"])) {
                GlobalModel.keybindManager.processKeyEvent(e.browserEvent, waveEvent);
            }
        });
        editor.onDidScrollChange((e) => {
            if (!syncing.current && e.scrollTopChanged) {
                syncing.current = true;
                handleEditorScrollChange(e);
                syncing.current = false;
            }
        });
        if (shouldFocus) {
            monacoEditor.current.focus();
            rendererApi.onFocusChanged(true);
        }
        if (monacoEditor.current.onDidFocusEditorWidget) {
            monacoEditor.current.onDidFocusEditorWidget(() => rendererApi.onFocusChanged(true));
            monacoEditor.current.onDidBlurEditorWidget(() => rendererApi.onFocusChanged(false));
        }
        if (!getAllowEditing()) setShowReadonly(true);
    };

    const handleEditorScrollChange = (e) => {
        if (!showPreview) return;
        const scrollableHeightEditor = monacoEditor.current.getScrollHeight() - monacoEditor.current.getLayoutInfo().height;
        const verticalScrollPercentage = e.scrollTop / scrollableHeightEditor;
        const markdownDiv = markdownRef.current;
        if (markdownDiv) {
            const scrollableHeightMarkdown = markdownDiv.scrollHeight - markdownDiv.clientHeight;
            markdownDiv.scrollTop = verticalScrollPercentage * scrollableHeightMarkdown;
        }
    };

    const handleDivScroll = () => {
        if (!syncing.current) {
            syncing.current = true;
            const markdownDiv = markdownRef.current;
            const scrollableHeightMarkdown = markdownDiv.scrollHeight - markdownDiv.clientHeight;
            const verticalScrollPercentage = markdownDiv.scrollTop / scrollableHeightMarkdown;
            const scrollableHeightEditor = monacoEditor.current.getScrollHeight() - monacoEditor.current.getLayoutInfo().height;
            monacoEditor.current.setScrollTop(verticalScrollPercentage * scrollableHeightEditor);
            syncing.current = false;
        }
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSelectedLanguage = e.target.value;
        setSelectedLanguage(newSelectedLanguage);
        setIsPreviewerAvailable(["markdown", "mdx"].includes(newSelectedLanguage));
        if (monacoEditor.current) {
            const model = monacoEditor.current.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, newSelectedLanguage);
                saveLineState({ lang: newSelectedLanguage });
            }
        }
    };

    const handleEditorChange = (newCode) => {
        codeCache.set(cacheKey, newCode);
        setCode(newCode);
        updateEditorHeight();
        setIsSave(newCode !== originalCode.current);
    };

    const getEditorHeightBuffer = () => GlobalModel.lineHeightEnv.lineHeight + 11;

    const updateEditorHeight = () => {
        const maxEditorHeight = opts.maxSize.height - getEditorHeightBuffer();
        let _editorHeight = maxEditorHeight;
        if (!getAllowEditing()) {
            if (code == null) return;
            const noOfLines = Math.max(code.split("\n").length, 5);
            const lineHeight = Math.ceil(GlobalModel.lineHeightEnv.lineHeight);
            _editorHeight = Math.min(noOfLines * lineHeight + 10, maxEditorHeight);
        }
        setEditorHeight(_editorHeight);
        if (isSelected) {
            scrollToBringIntoViewport();
        }
    };

    const getAllowEditing = () => {
        const mode = lineState["mode"] || "view";
        return mode !== "view" && !readOnly && !isClosed;
    };

    const updateEditorOpts = () => {
        if (monacoEditor.current) {
            monacoEditor.current.updateOptions(getEditorOptions());
        }
    };

    const getEditorOptions = (): MonacoTypes.editor.IEditorOptions => {
        const opts: MonacoTypes.editor.IEditorOptions = {
            scrollBeyondLastLine: false,
            fontSize: GlobalModel.getTermFontSize(),
            fontFamily: GlobalModel.getTermFontFamily(),
            readOnly: !getAllowEditing(),
        };
        if (showPreview || ("minimap" in lineState && !lineState["minimap"])) {
            opts.minimap = { enabled: false };
        }
        return opts;
    };

    const setSizes = (sizes: number[]) => {
        setEditorFraction(sizes[0]);
        saveLineState({ editorFraction: sizes[0] });
    };

    if (isClosed) {
        return <div className="code-renderer"></div>;
    }
    if (code === null) {
        return <div className="code-renderer" style={{ height: savedHeight }} />;
    }
    if (exitcode === 1) {
        return (
            <div className="text-white" style={{ fontSize: GlobalModel.getTermFontSize() }}>
                {code}
            </div>
        );
    }

    const theme = `wave-theme-${GlobalModel.isDarkTheme.get() ? "dark" : "light"}`;
    const allowEditing = getAllowEditing();

    return (
        <div className="code-renderer">
            <If condition={isSelected}>
                <CodeKeybindings codeObject={{ registerKeybindings, unregisterKeybindings }} />
            </If>
            <Split
                sizes={[editorFraction, 1 - editorFraction]}
                onSetSizes={setSizes}
                className="split-horizontal"
                gutterClassName="gutter gutter-horizontal"
            >
                <div className="editor-wrap relative" style={{ maxHeight: editorHeight }}>
                    {showReadonly && (
                        <div className="absolute top-1 right-48 z-10 px-2 py-0 text-xs rounded bg-secondary text-disabled">
                            read-only
                        </div>
                    )}
                    <Editor
                        theme={theme}
                        height={editorHeight}
                        defaultLanguage={selectedLanguage}
                        value={code}
                        onMount={handleEditorDidMount}
                        options={getEditorOptions()}
                        onChange={handleEditorChange}
                    />
                </div>
                {isPreviewerAvailable && showPreview && (
                    <div
                        className="overflow-y-auto"
                        style={{ maxHeight: editorHeight }}
                        ref={markdownRef}
                        onScroll={handleDivScroll}
                    >
                        <Markdown text={code} className="w-full p-4" />
                    </div>
                )}
            </Split>
            <div className="flex-spacer" />
            <div className="code-statusbar">
                <If condition={message != null}>
                    <div
                        className={clsx(
                            "overflow-hidden text-ellipsis whitespace-nowrap",
                            message.status === "error" ? "text-red-500" : "text-green-500"
                        )}
                    >
                        {message.text}
                    </div>
                </If>
                <div className="flex-spacer" />
                <If condition={isPreviewerAvailable}>
                    <Button variant="ghost" size="sm" onClick={togglePreview}>
                        {`${showPreview ? "hide" : "show"} preview (`}
                        {renderCmdText("P")}
                        {`)`}
                    </Button>
                </If>
                <select
                    className="dropdown max-w-[200px]"
                    value={selectedLanguage}
                    onChange={handleLanguageChange}
                >
                    {languages.map((lang, index) => (
                        <option key={index} value={lang}>
                            {lang}
                        </option>
                    ))}
                </select>
                <If condition={allowEditing}>
                    <Button variant="ghost" size="sm" onClick={() => doSave()}>
                        {`save (`}
                        {renderCmdText("S")}
                        {`)`}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={doClose}>
                        {`close (`}
                        {renderCmdText("D")}
                        {`)`}
                    </Button>
                </If>
            </div>
        </div>
    );
};
