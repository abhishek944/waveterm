// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";
import { debounce } from "throttle-debounce";
import { boundMethod } from "autobind-decorator";
import { PacketDataBuffer } from "../core/ptydata";
import { Markdown } from "@/components/ui/markdown";

type OpenAIOutputType = {
    model: string;
    created: number;
    finish_reason: string;
    message: string;
};

export class OpenAIRendererModel {
    context: RendererContext;
    opts: RendererOpts;
    isDone: OV<boolean>;
    api: RendererModelContainerApi;
    savedHeight: number;
    loading: OV<boolean>;
    loadError: OV<string> = mobx.observable.box(null, { name: "renderer-loadError" });
    chatError: OV<string> = mobx.observable.box(null, { name: "renderer-chatError" });
    updateHeight_debounced: (newHeight: number) => void;
    ptyDataSource: (termContext: TermContextUnion) => Promise<PtyDataType>;
    packetData: PacketDataBuffer;
    rawCmd: WebCmd;
    output: OV<OpenAIOutputType>;
    version: OV<number>;

    constructor() {
        this.updateHeight_debounced = debounce(1000, this.updateHeight.bind(this));
        this.packetData = new PacketDataBuffer(this.packetCallback);
        this.output = mobx.observable.box(null, { name: "openai-output" });
        this.version = mobx.observable.box(0);
    }

    initialize(params: RendererModelInitializeParams): void {
        this.loading = mobx.observable.box(true, { name: "renderer-loading" });
        this.isDone = mobx.observable.box(params.isDone, { name: "renderer-isDone" });
        this.context = params.context;
        this.opts = params.opts;
        this.api = params.api;
        this.savedHeight = params.savedHeight;
        this.ptyDataSource = params.ptyDataSource;
        this.rawCmd = params.rawCmd;
        setTimeout(() => this.reload(0), 10);
    }

    @boundMethod
    packetCallback(packetAny: any) {
        let packet: OpenAIPacketType = packetAny;
        if (packet == null) {
            return;
        }
        if (packet.error != null) {
            mobx.action(() => {
                this.chatError.set(packet.error);
                this.version.set(this.version.get() + 1);
            })();
            return;
        }
        if (packet.model != null && (packet.index ?? 0) == 0) {
            let output = {
                model: packet.model,
                created: packet.created,
                finish_reason: packet.finish_reason,
                message: packet.text ?? "",
            };
            mobx.action(() => {
                this.output.set(output);
            })();
            return;
        }
        if ((packet.index ?? 0) == 0) {
            mobx.action(() => {
                let output = this.output.get();
                if (output == null) {
                    return;
                }
                if (packet.finish_reason != null) {
                    this.output.get().finish_reason = packet.finish_reason;
                }
                if (packet.text != null) {
                    this.output.get().message += packet.text;
                }
                this.version.set(this.version.get() + 1);
            })();
        }
    }

    dispose(): void {
        return;
    }

    giveFocus(): void {
        return;
    }

    updateOpts(update: RendererOptsUpdate): void {
        Object.assign(this.opts, update);
    }

    updateHeight(newHeight: number): void {
        if (this.savedHeight != newHeight) {
            this.savedHeight = newHeight;
            this.api.saveHeight(newHeight);
        }
    }

    setIsDone(): void {
        if (this.isDone.get()) {
            return;
        }
        mobx.action(() => {
            this.isDone.set(true);
        })();
    }

    reload(delayMs: number): void {
        mobx.action(() => {
            this.loading.set(true);
            this.loadError.set(null);
            this.chatError.set(null);
        })();
        let rtnp = this.ptyDataSource(this.context);
        if (rtnp == null) {
            console.log("no promise returned from ptyDataSource (openai renderer)", this.context);
            return;
        }
        rtnp.then((ptydata) => {
            setTimeout(() => {
                this.packetData.reset();
                this.receiveData(ptydata.pos, ptydata.data, "reload");
                mobx.action(() => {
                    this.loading.set(false);
                })();
            }, delayMs);
        }).catch((e) => {
            console.log("error loading data", e);
            mobx.action(() => {
                this.loadError.set("error loading data: " + e);
            })();
        });
    }

    receiveData(pos: number, data: Uint8Array, reason?: string): void {
        this.packetData.receiveData(pos, data, reason);
    }
}

export const OpenAIRenderer: React.FC<{ model: OpenAIRendererModel }> = observer(({ model }) => {
    const renderPrompt = (cmd: WebCmd) => {
        let cmdStr = cmd.cmdstr.trim();
        if (cmdStr.startsWith("/openai")) {
            let spaceIdx = cmdStr.indexOf(" ");
            if (spaceIdx > 0) {
                cmdStr = cmdStr.substr(spaceIdx + 1).trim();
            }
        }
        return (
            <div className="flex flex-row justify-start font-normal">
                <span className="text-green-400 w-25 flex-shrink-0 font-sans">[user]</span>
                <div className="text-main font-normal text-base">{cmdStr}</div>
            </div>
        );
    };

    const renderError = () => {
        return (
            <div className="flex flex-row justify-start font-normal">
                <span className="text-main w-25 flex-shrink-0 font-sans">[error]</span>
                <div className="text-main">{model.loadError.get()}</div>
            </div>
        );
    };

    const renderOutput = () => {
        const output = model.output.get();
        if (output == null || output.message == null || output.message == "") {
            return null;
        }
        const message = output.message;
        const opts = model.opts;
        let minWidth = opts.maxSize.width;
        if (minWidth > 1000) {
            minWidth = 1000;
        }
        return (
            <div className="flex flex-row justify-start font-normal">
                <div className="text-primary w-25 flex-shrink-0 font-sans">[assistant]</div>
                <div className="text-main">
                    <div style={{ maxHeight: opts.maxSize.height, paddingRight: 5 }}>
                        <Markdown text={message} />
                    </div>
                </div>
            </div>
        );
    };

    const renderChatError = () => {
        const chatError = model.chatError.get();
        if (chatError == null) {
            return null;
        }
        return (
            <div className="flex flex-row justify-start font-normal">
                <div className="text-main w-25 flex-shrink-0 font-sans">[error]</div>
                <div className="text-main">{chatError}</div>
            </div>
        );
    };

    const cmd = model.rawCmd;
    let styleVal: React.CSSProperties = {};
    if (model.loading.get() && model.savedHeight >= 0 && model.isDone) {
        styleVal = {
            height: model.savedHeight,
            maxHeight: model.opts.maxSize.height,
        };
    } else {
        let maxWidth = model.opts.maxSize.width;
        if (maxWidth > 1000) {
            maxWidth = 1000;
        }
        styleVal = {
            maxWidth: maxWidth,
            maxHeight: model.opts.maxSize.height,
        };
    }

    const loadError = model.loadError.get();
    if (loadError != null) {
        return (
            <div className="font-mono text-sm leading-6 overflow-y-auto text-red-500" style={styleVal}>
                {renderPrompt(cmd)}
                {renderError()}
            </div>
        );
    }

    return (
        <div className="font-mono text-sm leading-6 overflow-y-auto" style={styleVal}>
            {renderPrompt(cmd)}
            {renderOutput()}
            {renderChatError()}
        </div>
    );
});