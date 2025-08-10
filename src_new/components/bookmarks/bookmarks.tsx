// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import { clsx } from "clsx";
import { GlobalModel } from "@/models";

import { ReactComponent as CopyIcon } from "@/assets/icons/favourites/copy.svg";
import { ReactComponent as PenIcon } from "@/assets/icons/favourites/pen.svg";
import { ReactComponent as TrashIcon } from "@/assets/icons/favourites/trash.svg";
import { ReactComponent as FavoritesIcon } from "@/assets/icons/favourites.svg";
import { Markdown } from "@/components/ui/markdown";
import { CmdStrCode } from "@/components/ui/cmdstrcode";
import { MainView } from "@/components/ui/mainview";

interface BookmarkProps {
    bookmark: BookmarkType;
}

const BookmarkKeybindings: React.FC = () => {
    React.useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;
        const bookmarksModel = GlobalModel.bookmarksModel;
        
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:cancel", (waveEvent) => {
            bookmarksModel.handleUserClose();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:deleteItem", (waveEvent) => {
            bookmarksModel.handleUserDelete();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:selectAbove", (waveEvent) => {
            bookmarksModel.handleUserNavigate(-1);
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:selectBelow", (waveEvent) => {
            bookmarksModel.handleUserNavigate(1);
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:selectPageAbove", (waveEvent) => {
            bookmarksModel.handleUserNavigate(-10);
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:selectPageBelow", (waveEvent) => {
            bookmarksModel.handleUserNavigate(10);
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "generic:confirm", (waveEvent) => {
            bookmarksModel.handleUserConfirm();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "bookmarks:edit", (waveEvent) => {
            bookmarksModel.handleUserEdit();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "bookmarks", "bookmarks:copy", (waveEvent) => {
            bookmarksModel.handleUserCopy();
            return true;
        });

        return () => {
            GlobalModel.keybindManager.unregisterDomain("bookmarks");
        };
    }, []);

    return null;
};

const Bookmark: React.FC<BookmarkProps> = mobxReact.observer(({ bookmark }) => {
    const model = GlobalModel.bookmarksModel;
    const isSelected = model.activeBookmark.get() === bookmark.bookmarkid;
    const markdown = bookmark.description ?? "";
    const hasDesc = markdown !== "";
    const isEditing = model.editingBookmark.get() === bookmark.bookmarkid;
    const isCopied = mobx.computed(() => model.copiedIndicator.get() === bookmark.bookmarkid).get();

    const handleDeleteClick = React.useCallback(() => {
        model.handleDeleteBookmark(bookmark.bookmarkid);
    }, [bookmark.bookmarkid]);

    const handleEditClick = React.useCallback(() => {
        model.handleEditBookmark(bookmark.bookmarkid);
    }, [bookmark.bookmarkid]);

    const handleEditCancel = React.useCallback(() => {
        model.cancelEdit();
    }, []);

    const handleEditUpdate = React.useCallback(() => {
        model.confirmEdit();
    }, []);

    const handleDescChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        mobx.action(() => {
            model.tempDesc.set(e.target.value);
        })();
    }, []);

    const handleCmdChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        mobx.action(() => {
            model.tempCmd.set(e.target.value);
        })();
    }, []);

    const handleClick = React.useCallback(() => {
        model.selectBookmark(bookmark.bookmarkid);
    }, [bookmark.bookmarkid]);

    const handleUse = React.useCallback(() => {
        model.useBookmark(bookmark.bookmarkid);
    }, [bookmark.bookmarkid]);

    const clickCopy = React.useCallback(() => {
        model.handleCopyBookmark(bookmark.bookmarkid);
    }, [bookmark.bookmarkid]);

    if (isEditing) {
        return (
            <div
                data-bookmarkid={bookmark.bookmarkid}
                className={clsx("bookmark focus-parent is-editing", {
                    "pending-delete": model.pendingDelete.get() === bookmark.bookmarkid,
                })}
            >
                <div className={clsx("focus-indicator", { active: isSelected })} />
                <div className="bookmark-edit">
                    <div className="field">
                        <label className="label">Description (markdown)</label>
                        <div className="control">
                            <textarea
                                className="textarea"
                                rows={6}
                                value={model.tempDesc.get()}
                                onChange={handleDescChange}
                            />
                        </div>
                    </div>
                    <div className="field">
                        <label className="label">Command</label>
                        <div className="control">
                            <textarea
                                className="textarea"
                                rows={3}
                                value={model.tempCmd.get()}
                                onChange={handleCmdChange}
                            />
                        </div>
                    </div>
                    <div className="field is-grouped">
                        <div className="control">
                            <button className="button is-link" onClick={handleEditUpdate}>
                                Update
                            </button>
                        </div>
                        <div className="control">
                            <button className="button" onClick={handleEditCancel}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={clsx("bookmark focus-parent", {
                "pending-delete": model.pendingDelete.get() === bookmark.bookmarkid,
            })}
            onClick={handleClick}
        >
            <div className={clsx("focus-indicator", { active: isSelected })} />
            <div className="bookmark-id-div">{bookmark.bookmarkid.substr(0, 8)}</div>
            <div className="bookmark-content">
                {hasDesc && (
                    <Markdown text={markdown} className="bottom-margin" />
                )}
                <CmdStrCode
                    cmdstr={bookmark.cmdstr}
                    onUse={handleUse}
                    onCopy={clickCopy}
                    isCopied={isCopied}
                    fontSize="large"
                    limitHeight={false}
                />
            </div>
            <div className="bookmark-controls">
                <div className="bookmark-control" onClick={handleEditClick}>
                    <PenIcon className={"icon"} />
                </div>
                <div className="bookmark-control" onClick={handleDeleteClick}>
                    <TrashIcon className={"icon"} />
                </div>
            </div>
        </div>
    );
});

const BookmarksView: React.FC = mobxReact.observer(() => {
    const isHidden = GlobalModel.activeMainView.get() !== "bookmarks";
    const bookmarks = GlobalModel.bookmarksModel.bookmarks;

    const handleClose = React.useCallback(() => {
        GlobalModel.bookmarksModel.closeView();
    }, []);

    if (isHidden) {
        return null;
    }

    return (
        <MainView className="bookmarks-view" title="Bookmarks" onClose={handleClose}>
            {!isHidden && <BookmarkKeybindings />}
            <div className="bookmarks-list">
                {bookmarks.map((bookmark) => (
                    <Bookmark key={bookmark.bookmarkid} bookmark={bookmark} />
                ))}
                {bookmarks.length === 0 && (
                    <div className="no-content">
                        No Bookmarks.
                        <br />
                        Use the <FavoritesIcon className={"icon"} /> icon on commands to add your first bookmark.
                    </div>
                )}
            </div>
            {bookmarks.length > 0 && (
                <div className="alt-help">
                    <div className="help-entry">
                        [Enter] to Use Bookmark
                        <br />
                        [Backspace/Delete]x2 or <TrashIcon className={"icon"} /> to Delete
                        <br />
                        [Arrow Up]/[Arrow Down]/[PageUp]/[PageDown] to Move in List
                        <br />
                        [e] or <PenIcon className={"icon"} /> to Edit
                        <br />
                        [c] or <CopyIcon className={"icon"} /> to Copy
                        <br />
                    </div>
                </div>
            )}
        </MainView>
    );
});

export { BookmarksView };