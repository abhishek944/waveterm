// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as mobx from "mobx";
import { sprintf } from "sprintf-js";
import { genMergeSimpleData } from "@/utils/util";
import { cmdStatusIsRunning } from "@/components/line/lineutil";
import { Cmd } from "./cmd";

class ScreenLines {
    screenId: string;
    loaded: OV<boolean> = mobx.observable.box(false, { name: "slines-loaded" });
    loadError: OV<string> = mobx.observable.box(null);
    lines: OArr<LineType> = mobx.observable.array([], {
        name: "slines-lines",
        deep: true,
    });
    cmds: Record<string, Cmd> = {}; // lineid => Cmd

    constructor(screenId: string) {
        this.screenId = screenId;
    }

    getNonArchivedLines(): LineType[] {
        let rtn: LineType[] = [];
        for (const line of this.lines) {
            if (line.archived) {
                continue;
            }
            // Skip thread_mode_cmd lines - they are only for sidebar display
            if (line.linetype === "thread_mode_cmd") {
                continue;
            }
            rtn.push(line);
        }
        return rtn;
    }

    updateData(slines: ScreenLinesType, load: boolean) {
        mobx.action(() => {
            if (load) {
                this.loaded.set(true);
            }
            
            // Debug logging for thread lines
            const threadLines = (slines.lines || []).filter(line => 
                line.linetype === "thread_mode" || line.linetype === "thread_mode_cmd"
            );
            if (threadLines.length > 0) {
                console.log(`[DEBUG] updateData: Found ${threadLines.length} thread lines`);
                threadLines.forEach(line => {
                    console.log(`[DEBUG] updateData: Thread line - lineId=${line.lineid}, lineType=${line.linetype}, text=${line.text}`);
                });
            }
            
            const threadCmds = (slines.cmds || []).filter(cmd => 
                cmd.cmdstr && cmd.cmdstr.startsWith("/thread")
            );
            
            // Custom merge to maintain deep observability
            this.mergeLines(slines.lines);
            let cmds = slines.cmds || [];
            for (const cmd of cmds) {
                this.cmds[cmd.lineid] = new Cmd(cmd);
            }
        })();
    }

    private mergeLines(newLines: LineType[]) {
        if (!newLines || newLines.length === 0) {
            return;
        }
        
        const objMap: Record<string, LineType> = {};
        for (const line of this.lines) {
            objMap[line.lineid] = line;
        }
        
        for (const newLine of newLines) {
            if (newLine.remove) {
                delete objMap[newLine.lineid];
            } else {
                const existingLine = objMap[newLine.lineid];
                if (existingLine) {
                    // Update existing line properties while maintaining observability
                    // Make sure linestate is observable
                    if (newLine.linestate) {
                        existingLine.linestate = mobx.observable(newLine.linestate);
                    } else {
                        existingLine.linestate = newLine.linestate;
                    }
                    // Update other properties
                    const { linestate, ...otherProps } = newLine;
                    Object.assign(existingLine, otherProps);
                } else {
                    // Make new line deeply observable
                    const observableLine = mobx.observable(newLine);
                    objMap[newLine.lineid] = observableLine;
                }
            }
        }
        
        const sortedLines = Object.values(objMap).sort((a, b) => {
            const aStr = sprintf("%013d:%s", a.ts, a.lineid);
            const bStr = sprintf("%013d:%s", b.ts, b.lineid);
            return aStr.localeCompare(bStr);
        });
        
        this.lines.replace(sortedLines);
    }

    setLoadError(errStr: string) {
        mobx.action(() => {
            this.loaded.set(true);
            this.loadError.set(errStr);
        })();
    }

    dispose() {}

    getCmd(lineId: string): Cmd {
        return this.cmds[lineId];
    }

    /**
     * Get all running cmds in the screen.
     * @param returnFirst If true, return the first running cmd found.
     * @returns An array of running cmds, or the first running cmd if returnFirst is true.
     */
    getRunningCmdLines(returnFirst?: boolean): LineType[] {
        let rtn: LineType[] = [];
        for (const line of this.lines) {
            const cmd = this.getCmd(line.lineid);
            if (cmd == null) {
                continue;
            }
            const status = cmd.getStatus();
            if (cmdStatusIsRunning(status)) {
                if (returnFirst) {
                    return [line];
                }
                rtn.push(line);
            }
        }
        return rtn;
    }

    /**
     * Check if there are any running cmds in the screen.
     * @returns True if there are any running cmds.
     */
    hasRunningCmdLines(): boolean {
        return this.getRunningCmdLines(true).length > 0;
    }

    updateCmd(cmd: CmdDataType): void {
        if (cmd.remove) {
            throw new Error("cannot remove cmd with updateCmd call [" + cmd.lineid + "]");
        }
        let origCmd = this.cmds[cmd.lineid];
        if (origCmd != null) {
            origCmd.setCmd(cmd);
        }
    }

    mergeCmd(cmd: CmdDataType): void {
        if (cmd.remove) {
            delete this.cmds[cmd.lineid];
            return;
        }
        let origCmd = this.cmds[cmd.lineid];
        if (origCmd == null) {
            this.cmds[cmd.lineid] = new Cmd(cmd);
            return;
        }
        origCmd.setCmd(cmd);
    }

    addLineCmd(line: LineType, cmd: CmdDataType, interactive: boolean) {
        if (!this.loaded.get()) {
            return;
        }
        mobx.action(() => {
            if (cmd != null) {
                this.mergeCmd(cmd);
            }
            if (line != null) {
                console.log(`[addLineCmd] Updating line ${line.lineid}, linestate:`, line.linestate);
                let lines = this.lines;
                if (line.remove) {
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].lineid == line.lineid) {
                            this.lines.splice(i, 1);
                            break;
                        }
                    }
                    return;
                }
                let lineIdx = 0;
                for (lineIdx; lineIdx < lines.length; lineIdx++) {
                    let lineId = lines[lineIdx].lineid;
                    let curTs = lines[lineIdx].ts;
                    if (lineId == line.lineid) {
                        // Update existing line while maintaining deep observability
                        const existingLine = this.lines[lineIdx];
                        console.log(`[addLineCmd] Found existing line, old linestate:`, existingLine.linestate);
                        // Make sure linestate is observable
                        if (line.linestate) {
                            existingLine.linestate = mobx.observable(line.linestate);
                        } else {
                            existingLine.linestate = line.linestate;
                        }
                        // Update other properties
                        const { linestate, ...otherProps } = line;
                        Object.assign(existingLine, otherProps);
                        console.log(`[addLineCmd] Updated line, new linestate:`, existingLine.linestate);
                        return;
                    }
                    if (curTs > line.ts || (curTs == line.ts && lineId > line.lineid)) {
                        break;
                    }
                }
                if (lineIdx == lines.length) {
                    // Make new line deeply observable before adding
                    const observableLine = mobx.observable(line);
                    this.lines.push(observableLine);
                    return;
                }
                // Make new line deeply observable before adding
                const observableLine = mobx.observable(line);
                this.lines.splice(lineIdx, 0, observableLine);
            }
        })();
    }
}

export { ScreenLines };
