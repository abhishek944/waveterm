// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"

	"github.com/abhishek944/waveterm/waveshell/pkg/base"
	"github.com/abhishek944/waveterm/waveshell/pkg/packet"
	"github.com/abhishek944/waveterm/waveshell/pkg/shellenv"
	"github.com/abhishek944/waveterm/waveshell/pkg/shellutil"
	"github.com/abhishek944/waveterm/waveshell/pkg/utilfn"
	"github.com/abhishek944/waveterm/wavesrv/pkg/comp"
	"github.com/abhishek944/waveterm/wavesrv/pkg/dbutil"
	"github.com/abhishek944/waveterm/wavesrv/pkg/ephemeral"
	"github.com/abhishek944/waveterm/wavesrv/pkg/history"
	"github.com/abhishek944/waveterm/wavesrv/pkg/releasechecker"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/openai"
	"github.com/abhishek944/waveterm/wavesrv/pkg/rtnstate"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
	"github.com/abhishek944/waveterm/wavesrv/pkg/waveenc"
	"github.com/google/uuid"
	"github.com/kevinburke/ssh_config"
)

const (
	HistoryTypeScreen  = "screen"
	HistoryTypeSession = "session"
	HistoryTypeGlobal  = "global"
)

func init() {
	comp.RegisterSimpleCompFn(comp.CGTypeMeta, simpleCompMeta)
	comp.RegisterSimpleCompFn(comp.CGTypeCommandMeta, simpleCompCommandMeta)
}

const DefaultUserId = "user"
const MaxNameLen = 50
const MaxShareNameLen = 150
const MaxRendererLen = 50
const MaxRemoteAliasLen = 50
const PasswordUnchangedSentinel = "--unchanged--"
const DefaultPTERM = "MxM"
const MaxCommandLen = 4096
const MaxSignalLen = 12
const MaxSignalNum = 64
const MaxEvalDepth = 5
const MaxOpenAIAPITokenLen = 200
const MaxOpenAIModelLen = 100
const MaxSidebarSections = 5

const TermFontSizeMin = 8
const TermFontSizeMax = 24

const TsFormatStr = "2006-01-02 15:04:05"

const OpenAIPacketTimeout = 10 * 1000 * time.Millisecond
const OpenAIStreamTimeout = 5 * time.Minute
const OpenAICloudCompletionTelemetryOffErrorMsg = "To ensure responsible usage and prevent misuse, Wave AI requires telemetry to be enabled when using its free AI features.\n\nIf you prefer not to enable telemetry, you can still access Wave AI's features by providing your own OpenAI API key or AI Base URL in the Settings menu. Please note that when using your personal API key, requests will be sent directly to the OpenAI API or the API that you specified with the AI Base URL, without being proxied through Wave's servers.\n\nIf you wish to continue using Wave AI's free features, you can easily enable telemetry by running the '/telemetry:on' command in the terminal. This will allow you to access the free AI features while helping to protect the platform from abuse."

const (
	KwArgRenderer = "renderer"
	KwArgView     = "view"
	KwArgState    = "state"
	KwArgTemplate = "template"
	KwArgLang     = "lang"
	KwArgMinimap  = "minimap"
	KwArgNoHist   = "nohist"
	KwArgSudo     = "sudo"
)

var ColorNames = []string{
	"yellow", "blue", "pink", "mint", "cyan", "violet", "orange", "green", "red", "white",
	"sunset", "ocean", "minty", "sunrise", "emerald", "amethyst", "lava", "steel", "charcoal", "spring",
}
var TabIcons = []string{"square", "sparkle", "fire", "ghost", "cloud", "compass", "crown", "droplet", "graduation-cap", "heart", "file"}
var RemoteColorNames = []string{"red", "green", "yellow", "blue", "magenta", "cyan", "white", "orange"}
var RemoteSetArgs = []string{"alias", "connectmode", "key", "password", "autoinstall", "color"}
var ConfirmFlags = []string{"hideshellprompt"}
var SidebarNames = []string{"main"}
var ThemeSources = []string{"light", "dark", "system"}

var ScreenCmds = []string{"run", "comment", "cd", "cr", "clear", "sw", "reset", "signal", "chat"}
var NoHistCmds = []string{"_compgen", "line", "history", "_killserver"}
var GlobalCmds = []string{"session", "screen", "remote", "set", "client", "telemetry", "bookmark", "bookmarks"}

var SetVarNameMap map[string]string = map[string]string{
	"tabcolor": "screen.tabcolor",
	"tabicon":  "screen.tabicon",
	"pterm":    "screen.pterm",
	"anchor":   "screen.anchor",
	"focus":    "screen.focus",
	"line":     "screen.line",
	"index":    "screen.index",
}

var SetVarScopes = []SetVarScope{
	{ScopeName: "global", VarNames: []string{}},
	{ScopeName: "client", VarNames: []string{"telemetry"}},
	{ScopeName: "session", VarNames: []string{"name", "pos", "theme"}},
	{ScopeName: "screen", VarNames: []string{"name", "tabcolor", "tabicon", "pos", "pterm", "anchor", "focus", "line", "index", "theme"}},
	{ScopeName: "line", VarNames: []string{}},
	// connection = remote, remote = remoteinstance
	{ScopeName: "connection", VarNames: []string{"alias", "connectmode", "key", "password", "autoinstall", "color"}},
	{ScopeName: "remote", VarNames: []string{}},
}

var userHostRe = regexp.MustCompile(`^(sudo@)?([a-zA-Z0-9][a-zA-Z0-9._@:\\-]*@)?([a-z0-9][a-z0-9.-]*)(?::([0-9]+))?$`)
var remoteAliasRe = regexp.MustCompile("^[a-zA-Z0-9][a-zA-Z0-9._-]*$")
var genericNameRe = regexp.MustCompile("^[a-zA-Z][a-zA-Z0-9_ .()<>,/\"'\\[\\]{}=+$@!*-]*$")
var rendererRe = regexp.MustCompile("^[a-zA-Z][a-zA-Z0-9_.:-]*$")
var positionRe = regexp.MustCompile("^((S?\\+|E?-)?[0-9]+|(\\+|-|S|E))$")
var wsRe = regexp.MustCompile("\\s+")
var sigNameRe = regexp.MustCompile("^((SIG[A-Z0-9]+)|(\\d+))$")

type contextType string

var historyContextKey = contextType("history")
var depthContextKey = contextType("depth")

type SetVarScope struct {
	ScopeName string
	VarNames  []string
}

type historyContextType struct {
	LineId        string
	LineNum       int64
	RemotePtr     *sstore.RemotePtrType
	FeState       sstore.FeStateType
	InitialStatus string
}

type MetaCmdFnType = func(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error)
type MetaCmdEntryType struct {
	IsAlias bool
	Fn      MetaCmdFnType
}

var MetaCmdFnMap = make(map[string]MetaCmdEntryType)

func init() {
	registerCmdFn("run", RunCommand)
	registerCmdFn("eval", EvalCommand)
	registerCmdFn("comment", CommentCommand)
	registerCmdFn("cr", CrCommand)
	registerCmdFn("connect", CrCommand)
	registerCmdFn("_compgen", CompGenCommand)
	registerCmdFn("_compfiledir", CompFileDirCommand)
	registerCmdFn("clear", ClearCommand)
	registerCmdFn("reset", RemoteResetCommand)
	registerCmdFn("reset:cwd", ResetCwdCommand)
	registerCmdFn("signal", SignalCommand)
	registerCmdFn("sync", SyncCommand)
	registerCmdFn("sleep", SleepCommand)

	registerCmdFn("mainview", MainViewCommand)

	registerCmdFn("session", SessionCommand)
	registerCmdFn("session:open", SessionOpenCommand)
	registerCmdAlias("session:new", SessionOpenCommand)
	registerCmdFn("session:set", SessionSetCommand)
	registerCmdFn("session:delete", SessionDeleteCommand)
	registerCmdFn("session:archive", SessionArchiveCommand)
	registerCmdFn("session:showall", SessionShowAllCommand)
	registerCmdFn("session:show", SessionShowCommand)
	registerCmdFn("session:openshared", SessionOpenSharedCommand)
	registerCmdFn("session:termtheme", TermSetThemeCommand)
	registerCmdFn("session:ensureone", SessionEnsureOneCommand)

	registerCmdFn("screen", ScreenCommand)
	registerCmdFn("screen:archive", ScreenArchiveCommand)
	registerCmdFn("screen:delete", ScreenDeleteCommand)
	registerCmdFn("screen:open", ScreenOpenCommand)
	registerCmdAlias("screen:new", ScreenOpenCommand)
	registerCmdFn("screen:set", ScreenSetCommand)
	registerCmdFn("screen:showall", ScreenShowAllCommand)
	registerCmdFn("screen:reset", ScreenResetCommand)
	registerCmdFn("screen:webshare", ScreenWebShareCommand)
	registerCmdFn("screen:reorder", ScreenReorderCommand)
	registerCmdFn("screen:show", ScreenShowCommand)
	registerCmdFn("screen:termtheme", TermSetThemeCommand)
	registerCmdFn("screen:resize", ScreenResizeCommand)

	registerCmdAlias("remote", RemoteCommand)
	registerCmdFn("remote:show", RemoteShowCommand)
	registerCmdFn("remote:showall", RemoteShowAllCommand)
	registerCmdFn("remote:new", RemoteNewCommand)
	registerCmdFn("remote:archive", RemoteArchiveCommand)
	registerCmdFn("remote:set", RemoteSetCommand)
	registerCmdFn("remote:disconnect", RemoteDisconnectCommand)
	registerCmdFn("remote:connect", RemoteConnectCommand)
	registerCmdFn("remote:install", RemoteInstallCommand)
	registerCmdFn("remote:installcancel", RemoteInstallCancelCommand)
	registerCmdFn("remote:reset", RemoteResetCommand)
	registerCmdFn("remote:parse", RemoteConfigParseCommand)
	registerCmdFn("copyfile", CopyFileCommand)

	registerCmdFn("line", LineCommand)
	registerCmdFn("line:show", LineShowCommand)
	registerCmdFn("line:star", LineStarCommand)
	registerCmdFn("line:bookmark", LineBookmarkCommand)
	registerCmdFn("line:pin", LinePinCommand)
	registerCmdFn("line:archive", LineArchiveCommand)
	registerCmdFn("line:delete", LineDeleteCommand)
	registerCmdFn("line:setheight", LineSetHeightCommand)
	registerCmdFn("line:view", LineViewCommand)
	registerCmdFn("line:set", LineSetCommand)
	registerCmdFn("line:restart", LineRestartCommand)
	registerCmdFn("line:minimize", LineMinimizeCommand)

	registerCmdFn("client", ClientCommand)
	registerCmdFn("client:show", ClientShowCommand)
	registerCmdFn("client:set", ClientSetCommand)
	registerCmdFn("client:notifyupdatewriter", ClientNotifyUpdateWriterCommand)
	registerCmdFn("client:accepttos", ClientAcceptTosCommand)
	registerCmdFn("client:setconfirmflag", ClientConfirmFlagCommand)
	registerCmdFn("client:setmainsidebar", ClientSetMainSidebarCommand)
	registerCmdFn("client:setrightsidebar", ClientSetRightSidebarCommand)
	registerCmdFn("client:setglobalshortcut", ClientSetGlobalShortcut)
	registerCmdFn("client:verifyaiprovider", ClientVerifyAIProviderCommand)

	registerCmdFn("sidebar:open", SidebarOpenCommand)
	registerCmdFn("sidebar:close", SidebarCloseCommand)
	registerCmdFn("sidebar:add", SidebarAddCommand)
	registerCmdFn("sidebar:remove", SidebarRemoveCommand)

	// registerCmdFn("telemetry", TelemetryCommand)
	// registerCmdFn("telemetry:on", TelemetryOnCommand)
	// registerCmdFn("telemetry:off", TelemetryOffCommand)
	// registerCmdFn("telemetry:send", TelemetrySendCommand)
	// registerCmdFn("telemetry:show", TelemetryShowCommand)

	registerCmdFn("releasecheck", ReleaseCheckCommand)
	registerCmdFn("releasecheck:autoon", ReleaseCheckOnCommand)
	registerCmdFn("releasecheck:autooff", ReleaseCheckOffCommand)

	registerCmdFn("history", HistoryCommand)
	registerCmdFn("history:viewall", HistoryViewAllCommand)
	registerCmdFn("history:purge", HistoryPurgeCommand)

	registerCmdFn("bookmarks:show", BookmarksShowCommand)
	registerCmdFn("bookmark:set", BookmarkSetCommand)
	registerCmdFn("bookmark:delete", BookmarkDeleteCommand)

	registerCmdFn("agent", AgentCommand)
	registerCmdFn("thread", ThreadCommand)
	registerCmdFn("thread:instruction", ThreadInstructionCommand)
	registerCmdFn("thread:addline", ThreadAddLineCommand)
	registerCmdFn("thread:removeline", ThreadRemoveLineCommand)
	registerCmdFn("thread:create", ThreadCreateCommand)
	registerCmdFn("thread:forcestop", ThreadForceStopCommand)

	registerCmdFn("_killserver", KillServerCommand)
	registerCmdFn("_dumpstate", DumpStateCommand)
	registerCmdFn("_requestthreads", RequestThreadsCommand)

	registerCmdFn("set", SetCommand)

	registerCmdFn("view:stat", ViewStatCommand)
	registerCmdFn("view:test", ViewTestCommand)

	registerCmdFn("edit:test", EditTestCommand)

	// CodeEditCommand is overloaded to do codeedit and codeview
	registerCmdFn("codeedit", CodeEditCommand)
	registerCmdFn("codeview", CodeEditCommand)

	registerCmdFn("imageview", ImageViewCommand)
	registerCmdFn("mdview", MarkdownViewCommand)
	registerCmdFn("markdownview", MarkdownViewCommand)
	registerCmdFn("pdfview", PdfViewCommand)
	registerCmdFn("mediaview", MediaViewCommand)
	registerCmdFn("csvview", CSVViewCommand)

	registerCmdFn("_debug:ri", DebugRemoteInstanceCommand)

	registerCmdFn("sudo:clear", ClearSudoCache)

	registerCmdFn("autocomplete:on", AutocompleteOnCommand)
	registerCmdFn("autocomplete:off", AutocompleteOffCommand)
}

func getValidCommands() []string {
	var rtn []string
	for key, val := range MetaCmdFnMap {
		if val.IsAlias {
			continue
		}
		rtn = append(rtn, "/"+key)
	}
	return rtn
}

func registerCmdFn(cmdName string, fn MetaCmdFnType) {
	MetaCmdFnMap[cmdName] = MetaCmdEntryType{Fn: fn}
}

func registerCmdAlias(cmdName string, fn MetaCmdFnType) {
	MetaCmdFnMap[cmdName] = MetaCmdEntryType{IsAlias: true, Fn: fn}
}

func GetCmdStr(pk *scpacket.FeCommandPacketType) string {
	if pk.MetaSubCmd == "" {
		return pk.MetaCmd
	}
	return pk.MetaCmd + ":" + pk.MetaSubCmd
}

func HandleCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	metaCmd := SubMetaCmd(pk.MetaCmd)
	var cmdName string
	if pk.MetaSubCmd == "" {
		cmdName = metaCmd
	} else {
		cmdName = fmt.Sprintf("%s:%s", pk.MetaCmd, pk.MetaSubCmd)
	}
	entry := MetaCmdFnMap[cmdName]
	if entry.Fn == nil {
		if MetaCmdFnMap[metaCmd].Fn != nil {
			return nil, fmt.Errorf("invalid /%s subcommand '%s'", metaCmd, pk.MetaSubCmd)
		}
		return nil, fmt.Errorf("invalid command '/%s', no handler", cmdName)
	}
	return entry.Fn(ctx, pk)
}

func firstArg(pk *scpacket.FeCommandPacketType) string {
	if len(pk.Args) == 0 {
		return ""
	}
	return pk.Args[0]
}

func argN(pk *scpacket.FeCommandPacketType, n int) string {
	if len(pk.Args) <= n {
		return ""
	}
	return pk.Args[n]
}

// will trim strings for whitespace
func resolveCommaSepListToMap(arg string) map[string]bool {
	if arg == "" {
		return nil
	}
	rtn := make(map[string]bool)
	fields := strings.Split(arg, ",")
	for _, field := range fields {
		field = strings.TrimSpace(field)
		rtn[field] = true
	}
	return rtn
}

func resolveShellType(shellArg string, defaultShell string) (string, error) {
	if shellArg == "" {
		if defaultShell == "" {
			shellArg = packet.ShellType_bash
		} else {
			shellArg = defaultShell
		}
	}
	if shellArg != packet.ShellType_bash && shellArg != packet.ShellType_zsh {
		return "", fmt.Errorf("invalid shell type %q", shellArg)
	}
	return shellArg, nil
}

func resolveBool(arg string, def bool) bool {
	if arg == "" {
		return def
	}
	if arg == "0" || arg == "false" {
		return false
	}
	return true
}

func defaultStr(arg string, def string) string {
	if arg == "" {
		return def
	}
	return arg
}

func resolveFile(arg string) (string, error) {
	if arg == "" {
		return "", nil
	}
	fileName := base.ExpandHomeDir(arg)
	if !strings.HasPrefix(fileName, "/") {
		return "", fmt.Errorf("must be absolute, cannot be a relative path")
	}
	fd, err := os.Open(fileName)
	if fd != nil {
		fd.Close()
	}
	if err != nil {
		return "", fmt.Errorf("cannot open file: %v", err)
	}
	return fileName, nil
}

func resolvePosInt(arg string, def int) (int, error) {
	if arg == "" {
		return def, nil
	}
	ival, err := strconv.Atoi(arg)
	if err != nil {
		return 0, err
	}
	if ival <= 0 {
		return 0, fmt.Errorf("must be greater than 0")
	}
	return ival, nil
}

func isAllDigits(arg string) bool {
	if len(arg) == 0 {
		return false
	}
	for i := 0; i < len(arg); i++ {
		if arg[i] >= '0' && arg[i] <= '9' {
			continue
		}
		return false
	}
	return true
}

func resolveNonNegInt(arg string, def int) (int, error) {
	if arg == "" {
		return def, nil
	}
	ival, err := strconv.Atoi(arg)
	if err != nil {
		return 0, err
	}
	if ival < 0 {
		return 0, fmt.Errorf("cannot be negative")
	}
	return ival, nil
}

var histExpansionRe = regexp.MustCompile(`^!(\d+)$`)

func doCmdHistoryExpansion(ctx context.Context, ids resolvedIds, cmdStr string) (string, error) {
	if !strings.HasPrefix(cmdStr, "!") {
		return "", nil
	}
	if strings.HasPrefix(cmdStr, "! ") {
		return "", nil
	}
	if cmdStr == "!!" {
		return doHistoryExpansion(ctx, ids, -1)
	}
	if strings.HasPrefix(cmdStr, "!-") {
		return "", fmt.Errorf("wave does not support negative history offsets, use a stable positive history offset instead: '![linenum]'")
	}
	m := histExpansionRe.FindStringSubmatch(cmdStr)
	if m == nil {
		return "", fmt.Errorf("unsupported history substitution, can use '!!' or '![linenum]'")
	}
	ival, err := strconv.Atoi(m[1])
	if err != nil {
		return "", fmt.Errorf("invalid history expansion")
	}
	return doHistoryExpansion(ctx, ids, ival)
}

func doHistoryExpansion(ctx context.Context, ids resolvedIds, hnum int) (string, error) {
	if hnum == 0 {
		return "", fmt.Errorf("invalid history expansion, cannot expand line number '0'")
	}
	if hnum < -1 {
		return "", fmt.Errorf("invalid history expansion, cannot expand negative history offsets")
	}
	foundHistoryNum := hnum
	if hnum == -1 {
		var err error
		foundHistoryNum, err = history.GetLastHistoryLineNum(ctx, ids.ScreenId)
		if err != nil {
			return "", fmt.Errorf("cannot expand history, error finding last history item: %v", err)
		}
		if foundHistoryNum == 0 {
			return "", fmt.Errorf("cannot expand history, no last history item")
		}
	}
	hitem, err := history.GetHistoryItemByLineNum(ctx, ids.ScreenId, foundHistoryNum)
	if err != nil {
		return "", fmt.Errorf("cannot get history item '%d': %v", foundHistoryNum, err)
	}
	if hitem == nil {
		return "", fmt.Errorf("cannot expand history, history item '%d' not found", foundHistoryNum)
	}
	return hitem.CmdStr, nil
}

func getEvalDepth(ctx context.Context) int {
	depthVal := ctx.Value(depthContextKey)
	if depthVal == nil {
		return 0
	}
	return depthVal.(int)
}

func SyncCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, fmt.Errorf("/sync error: %w", err)
	}
	runPacket := packet.MakeRunPacket()
	runPacket.ReqId = uuid.New().String()
	runPacket.CK = base.MakeCommandKey(ids.ScreenId, scbase.GenWaveUUID())
	runPacket.UsePty = true
	ptermVal := defaultStr(pk.Kwargs["wterm"], DefaultPTERM)
	runPacket.TermOpts, err = GetUITermOpts(pk.UIContext.WinSize, ptermVal)
	if err != nil {
		return nil, fmt.Errorf("/sync error, invalid 'wterm' value %q: %v", ptermVal, err)
	}
	runPacket.Command = ":"
	runPacket.ReturnState = true
	rcOpts := remote.RunCommandOpts{
		SessionId:     ids.SessionId,
		ScreenId:      ids.ScreenId,
		RemotePtr:     ids.Remote.RemotePtr,
		EphemeralOpts: &ephemeral.EphemeralRunOpts{TimeoutMs: ephemeral.DefaultEphemeralTimeoutMs},
	}
	_, callback, err := remote.RunCommand(ctx, rcOpts, runPacket)
	if callback != nil {
		defer callback()
	}
	if err != nil {
		return nil, err
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   "syncing state",
		TimeoutMs: 2000,
	})
	return update, nil
}

func getRendererArg(pk *scpacket.FeCommandPacketType) (string, error) {
	rval := pk.Kwargs[KwArgView]
	if rval == "" {
		rval = pk.Kwargs[KwArgRenderer]
	}
	if rval == "" {
		return "", nil
	}
	err := validateRenderer(rval)
	if err != nil {
		return "", err
	}
	return rval, nil
}

func getTemplateArg(pk *scpacket.FeCommandPacketType) (string, error) {
	rval := pk.Kwargs[KwArgTemplate]
	if rval == "" {
		return "", nil
	}
	// TODO validate
	return rval, nil
}

func getLangArg(pk *scpacket.FeCommandPacketType) (string, error) {
	// TODO better error checking
	if len(pk.Kwargs[KwArgLang]) > 50 {
		return "", nil // TODO return error, don't fail silently
	}
	return pk.Kwargs[KwArgLang], nil
}

func doNewTabConnectLocal(ctx context.Context, screenId string, uiContext *scpacket.UIContextType, initialCwd string) (scbus.UpdatePacket, error) {
	log.Printf("[DEBUG doNewTabConnectLocal] screenId=%s, initialCwd=%s", screenId, initialCwd)
	crPk := scpacket.MakeFeCommandPacket()
	crPk.MetaCmd = "connect"
	crPk.Args = []string{"local"}
	crPk.RawStr = "/connect local"
	crPk.UIContext = uiContext
	if initialCwd != "" && initialCwd != sstore.DefaultCwd {
		crPk.Kwargs = map[string]string{"cwd": initialCwd}
		log.Printf("[DEBUG doNewTabConnectLocal] Set kwargs[cwd]=%s", initialCwd)
	} else {
		log.Printf("[DEBUG doNewTabConnectLocal] No cwd to set (initialCwd=%s)", initialCwd)
	}
	crUpdate, err := CrCommand(ctx, crPk)
	if err != nil {
		return nil, fmt.Errorf("error creating tab, cannot connect to remote: %w", err)
	}
	return crUpdate, nil
}

var screenAnchorRe = regexp.MustCompile("^(\\d+)(?::(-?\\d+))?$")

var sidebarWidthRe = regexp.MustCompile("^\\d+(px|%)$")

func createRemoteViewRemoteIdUpdate(remoteId string) scbus.UpdatePacket {
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.RemoteViewType{
		PtyRemoteId: remoteId,
	})
	return update
}

func createRemoteViewRemoteEditUpdate(redit *sstore.RemoteEditType) scbus.UpdatePacket {
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.RemoteViewType{
		RemoteEdit: redit,
	})
	return update
}

func prettyPrintByteSize(size int64) string {
	gbSize := float64(size) / float64(1073741824)
	if gbSize > 1 {
		return fmt.Sprintf("%.2f Gigabytes", gbSize)
	}
	mbSize := float64(size) / float64(1048576)
	if mbSize > 1 {
		return fmt.Sprintf("%.2f Megabytes", mbSize)
	}
	kbSize := float64(size) / float64(1024)
	if kbSize > 1 {
		return fmt.Sprintf("%.2f Kilobytes", kbSize)
	}
	return fmt.Sprintf("%v Bytes", size)
}

// this can only be called in a defer func, because recover() only works inside of a defe
func deferWriteCmdStatus(ctx context.Context, cmd *sstore.CmdType, startTime time.Time, exitSuccess bool, outputPos int64) {
	r := recover()
	if r != nil {
		panicMsg := fmt.Sprintf("panic: %v", r)
		log.Printf("panic: %v\n", panicMsg)
		writeStringToPty(ctx, cmd, panicMsg, &outputPos)
	}
	duration := time.Since(startTime)
	cmdStatus := sstore.CmdStatusDone
	var exitCode int
	if !exitSuccess {
		cmdStatus = sstore.CmdStatusError
		exitCode = 1
	}
	ck := base.MakeCommandKey(cmd.ScreenId, cmd.LineId)
	doneInfo := sstore.CmdDoneDataValues{
		Ts:         time.Now().UnixMilli(),
		ExitCode:   exitCode,
		DurationMs: duration.Milliseconds(),
	}
	update := scbus.MakeUpdatePacket()
	err := sstore.UpdateCmdDoneInfo(context.Background(), update, ck, doneInfo, cmdStatus)
	if err != nil {
		// nothing to do
		log.Printf("error updating cmddoneinfo: %v\n", err)
		return
	}
	screen, err := sstore.UpdateScreenFocusForDoneCmd(ctx, cmd.ScreenId, cmd.LineId)
	if err != nil {
		log.Printf("error trying to update screen focus type: %v\n", err)
		// fall-through (nothing to do)
	}
	if screen != nil {
		update.AddUpdate(*screen)
	}
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
}

func checkForWriteReady(ctx context.Context, iter *packet.RpcResponseIter) (string, error) {
	readyIf, err := iter.Next(ctx)
	if err != nil {
		return "", fmt.Errorf("error getting write ready response: %v\r\n", err)
	}
	readyPk, ok := readyIf.(*packet.WriteFileReadyPacketType)
	if !ok {
		return "", fmt.Errorf("bad write ready packet received %v", readyIf)
	}
	if readyPk.Error != "" {
		return "", fmt.Errorf("ready error: %v", readyPk.Error)
	}
	return readyPk.RespId, nil
}

func checkForWriteFinished(ctx context.Context, iter *packet.RpcResponseIter) error {
	doneIf, err := iter.Next(ctx)
	if err != nil {
		return fmt.Errorf("error while getting done response: %v", err)
	}
	writeDonePk, ok := doneIf.(*packet.WriteFileDonePacketType)
	if !ok {
		return fmt.Errorf("bad done packet received: %T", doneIf)
	}
	if writeDonePk.Error != "" {
		return fmt.Errorf("done error: %v", writeDonePk.Error)
	}
	return nil
}

func getStatusBarString(filePercentageInt int) string {
	statusBarString := "\x1b[2k\r["
	for count := 0; count < 20; count++ {
		if (filePercentageInt - count*5) > 0 {
			statusBarString += "-"
		} else {
			statusBarString += " "
		}
	}
	if filePercentageInt < 100 {
		statusBarString += fmt.Sprintf("] %v%%", filePercentageInt)
	} else {
		statusBarString += "]"
	}
	return statusBarString
}

func writeStringToPty(ctx context.Context, cmd *sstore.CmdType, outputString string, outputPos *int64) {
	outBytes := []byte(outputString)
	update, err := sstore.AppendToCmdPtyBlob(ctx, cmd.ScreenId, cmd.LineId, outBytes, *outputPos)
	*outputPos += int64(len(outBytes))
	if err != nil {
		log.Printf("error writing to pty: %v", err)
	}
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	err = sstore.SetStatusIndicatorLevel(ctx, cmd.ScreenId, sstore.StatusIndicatorLevel_Output, false)
	if err != nil {
		// This is not a fatal error, so just log it
		log.Printf("error setting status indicator level to output in writeStringToPty: %v\n", err)
	}
}

func makeRemoteEditUpdate_new(err error) scbus.UpdatePacket {
	redit := &sstore.RemoteEditType{
		RemoteEdit: true,
	}
	if err != nil {
		redit.ErrorStr = err.Error()
	}
	return createRemoteViewRemoteEditUpdate(redit)
}

func makeRemoteEditErrorReturn_new(visual bool, err error) (scbus.UpdatePacket, error) {
	if visual {
		return makeRemoteEditUpdate_new(err), nil
	}
	return nil, err
}

func makeRemoteEditUpdate_edit(ids resolvedIds, err error) scbus.UpdatePacket {
	redit := &sstore.RemoteEditType{
		RemoteEdit: true,
	}
	redit.RemoteId = ids.Remote.RemotePtr.RemoteId
	if ids.Remote.RemoteCopy.SSHOpts != nil {
		redit.KeyStr = ids.Remote.RemoteCopy.SSHOpts.SSHIdentity
		redit.HasPassword = (ids.Remote.RemoteCopy.SSHOpts.SSHPassword != "")
	}
	if err != nil {
		redit.ErrorStr = err.Error()
	}
	return createRemoteViewRemoteEditUpdate(redit)
}

func makeRemoteEditErrorReturn_edit(ids resolvedIds, visual bool, err error) (scbus.UpdatePacket, error) {
	if visual {
		return makeRemoteEditUpdate_edit(ids, err), nil
	}
	return nil, err
}

type RemoteEditArgs struct {
	CanonicalName string
	SSHOpts       *sstore.SSHOpts
	ConnectMode   string
	Alias         string
	AutoInstall   bool
	Color         string
	ShellPref     string
	EditMap       map[string]interface{}
}

func parseRemoteEditArgs(isNew bool, pk *scpacket.FeCommandPacketType, isLocal bool) (*RemoteEditArgs, error) {
	var canonicalName string
	var sshOpts *sstore.SSHOpts
	var isSudo bool

	if isNew {
		if len(pk.Args) == 0 {
			return nil, fmt.Errorf("/remote:new must specify user@host argument (set visual=1 to edit in UI)")
		}
		userHost := pk.Args[0]
		m := userHostRe.FindStringSubmatch(userHost)
		if m == nil {
			return nil, fmt.Errorf("invalid format of user@host argument")
		}
		sudoStr, remoteUser, remoteHost, remotePortStr := m[1], m[2], m[3], m[4]
		remoteUser = strings.Trim(remoteUser, "@")
		var uhPort int
		if remotePortStr != "" {
			var err error
			uhPort, err = strconv.Atoi(remotePortStr)
			if err != nil {
				return nil, fmt.Errorf("invalid port specified on user@host argument")
			}
		}
		if sudoStr != "" {
			isSudo = true
		}
		if pk.Kwargs["sudo"] != "" {
			sudoArg := resolveBool(pk.Kwargs["sudo"], false)
			if isSudo && !sudoArg {
				return nil, fmt.Errorf("invalid 'sudo' argument, with sudo kw arg set to false")
			}
			if !isSudo && sudoArg {
				isSudo = true
			}
		}
		sshOpts = &sstore.SSHOpts{
			Local:   false,
			SSHHost: remoteHost,
			SSHUser: remoteUser,
			IsSudo:  isSudo,
		}
		portVal, err := resolvePosInt(pk.Kwargs["port"], 0)
		if err != nil {
			return nil, fmt.Errorf("invalid port %q: %v", pk.Kwargs["port"], err)
		}
		if portVal != 0 && uhPort != 0 && portVal != uhPort {
			return nil, fmt.Errorf("invalid port argument, does not match port specified in 'user@host:port' argument")
		}
		if portVal == 0 && uhPort != 0 {
			portVal = uhPort
		}
		if portVal < 0 || portVal > 65535 {
			// 0 is used as a sentinel value for the default in this case
			return nil, fmt.Errorf("invalid port argument, \"%d\" is not in the range of 1 to 65535", portVal)
		}
		sshOpts.SSHPort = portVal
		if remoteUser == "" {
			canonicalName = remoteHost
		} else {
			canonicalName = remoteUser + "@" + remoteHost
		}
		if portVal != 0 && portVal != 22 {
			canonicalName = canonicalName + ":" + strconv.Itoa(portVal)
		}
		if isSudo {
			canonicalName = "sudo@" + canonicalName
		}
	} else {
		if pk.Kwargs["sudo"] != "" {
			return nil, fmt.Errorf("cannot update 'sudo' value")
		}
		if pk.Kwargs["port"] != "" {
			return nil, fmt.Errorf("cannot update 'port' value")
		}
	}
	alias := pk.Kwargs["alias"]
	if alias != "" {
		if len(alias) > MaxRemoteAliasLen {
			return nil, fmt.Errorf("alias too long, max length = %d", MaxRemoteAliasLen)
		}
		if !remoteAliasRe.MatchString(alias) {
			return nil, fmt.Errorf("invalid alias format")
		}
	}
	var shellPref string
	if isNew {
		shellPref = sstore.ShellTypePref_Detect
	}
	if pk.Kwargs["shellpref"] != "" {
		shellPref = pk.Kwargs["shellpref"]
	}
	if shellPref != "" && shellPref != packet.ShellType_bash && shellPref != packet.ShellType_zsh && shellPref != sstore.ShellTypePref_Detect {
		return nil, fmt.Errorf("invalid shellpref %q, must be %s", shellPref, formatStrs([]string{packet.ShellType_bash, packet.ShellType_zsh, sstore.ShellTypePref_Detect}, "or", false))
	}
	var connectMode string
	if isNew {
		connectMode = sstore.ConnectModeAuto
	}
	if pk.Kwargs["connectmode"] != "" {
		connectMode = pk.Kwargs["connectmode"]
	}
	if connectMode != "" && !sstore.IsValidConnectMode(connectMode) {
		err := fmt.Errorf("invalid connectmode %q: valid modes are %s", connectMode, formatStrs([]string{sstore.ConnectModeStartup, sstore.ConnectModeAuto, sstore.ConnectModeManual}, "or", false))
		return nil, err
	}
	keyFile, err := resolveFile(pk.Kwargs["key"])
	if err != nil {
		return nil, fmt.Errorf("invalid ssh keyfile %q: %v", pk.Kwargs["key"], err)
	}
	color := pk.Kwargs["color"]
	if color != "" {
		err := validateRemoteColor(color, "remote color")
		if err != nil {
			return nil, err
		}
	}
	sshPassword := pk.Kwargs["password"]
	if sshOpts != nil {
		sshOpts.SSHIdentity = keyFile
		sshOpts.SSHPassword = sshPassword
	}

	// set up editmap
	editMap := make(map[string]interface{})
	if _, found := pk.Kwargs[sstore.RemoteField_Alias]; found {
		editMap[sstore.RemoteField_Alias] = alias
	}
	if connectMode != "" {
		if isLocal {
			return nil, fmt.Errorf("Cannot edit connect mode for 'local' remote")
		}
		editMap[sstore.RemoteField_ConnectMode] = connectMode
	}
	if _, found := pk.Kwargs["key"]; found {
		if isLocal {
			return nil, fmt.Errorf("Cannot edit ssh key file for 'local' remote")
		}
		editMap[sstore.RemoteField_SSHKey] = keyFile
	}
	if _, found := pk.Kwargs[sstore.RemoteField_Color]; found {
		editMap[sstore.RemoteField_Color] = color
	}
	if _, found := pk.Kwargs["password"]; found && pk.Kwargs["password"] != PasswordUnchangedSentinel {
		if isLocal {
			return nil, fmt.Errorf("Cannot edit ssh password for 'local' remote")
		}
		editMap[sstore.RemoteField_SSHPassword] = sshPassword
	}
	if _, found := pk.Kwargs["shellpref"]; found {
		editMap[sstore.RemoteField_ShellPref] = shellPref
	}

	return &RemoteEditArgs{
		SSHOpts:       sshOpts,
		ConnectMode:   connectMode,
		Alias:         alias,
		AutoInstall:   true,
		CanonicalName: canonicalName,
		Color:         color,
		EditMap:       editMap,
		ShellPref:     shellPref,
	}, nil
}

func resolveSshConfigPatterns(configFiles []string) ([]string, error) {
	// using two separate containers to track order and have O(1) lookups
	// since go does not have an ordered map primitive
	var discoveredPatterns []string
	alreadyUsed := make(map[string]bool)
	alreadyUsed[""] = true // this excludes the empty string from potential alias
	var openedFiles []fs.File

	defer func() {
		for _, openedFile := range openedFiles {
			openedFile.Close()
		}
	}()

	var errs []error
	for _, configFile := range configFiles {
		fd, openErr := os.Open(configFile)
		openedFiles = append(openedFiles, fd)
		if fd == nil {
			errs = append(errs, openErr)
			continue
		}

		cfg, _ := ssh_config.Decode(fd)
		for _, host := range cfg.Hosts {
			// for each host, find the first good alias
			for _, hostPattern := range host.Patterns {
				hostPatternStr := hostPattern.String()
				if strings.Index(hostPatternStr, "*") == -1 || alreadyUsed[hostPatternStr] == true {
					discoveredPatterns = append(discoveredPatterns, hostPatternStr)
					alreadyUsed[hostPatternStr] = true
					break
				}
			}
		}
	}
	if len(errs) == len(configFiles) {
		errs = append([]error{fmt.Errorf("no ssh config files could be opened:\n")}, errs...)
		return nil, errors.Join(errs...)
	}
	if len(discoveredPatterns) == 0 {
		return nil, fmt.Errorf("no compatible hostnames found in ssh config files")
	}

	return discoveredPatterns, nil
}

type HostInfoType struct {
	Host          string
	User          string
	CanonicalName string
	Port          int
	SshKeyFile    string
	ConnectMode   string
	Ignore        bool
	ShellPref     string
	ProxyCommand  string // Added ProxyCommand support
}

func createSshImportSummary(changeList map[string][]string) string {
	totalNumChanges := len(changeList["create"]) + len(changeList["delete"]) + len(changeList["update"]) + len(changeList["createErr"]) + len(changeList["deleteErr"]) + len(changeList["updateErr"])
	if totalNumChanges == 0 {
		return "No changes made from ssh config import"
	}
	remoteStatusMsgs := map[string]string{
		"delete":    "Deleted %d connection%s: %s",
		"create":    "Created %d connection%s: %s",
		"update":    "Edited %d connection%s: %s",
		"deleteErr": "Error deleting %d connection%s: %s",
		"createErr": "Error creating %d connection%s: %s",
		"updateErr": "Error editing %d connection%s: %s",
	}

	changeTypeKeys := []string{"delete", "create", "update", "deleteErr", "createErr", "updateErr"}

	var outMsgs []string
	for _, changeTypeKey := range changeTypeKeys {
		changes := changeList[changeTypeKey]
		if len(changes) > 0 {
			rawStatusMsg := remoteStatusMsgs[changeTypeKey]
			var pluralize string
			if len(changes) == 1 {
				pluralize = ""
			} else {
				pluralize = "s"
			}
			newMsg := fmt.Sprintf(rawStatusMsg, len(changes), pluralize, strings.Join(changes, ", "))
			outMsgs = append(outMsgs, newMsg)
		}
	}

	var pluralize string
	if totalNumChanges == 1 {
		pluralize = ""
	} else {
		pluralize = "s"
	}
	return fmt.Sprintf("%d connection%s changed:\n\n%s", totalNumChanges, pluralize, strings.Join(outMsgs, "\n\n"))
}

func NewHostInfo(hostName string) (*HostInfoType, error) {
	userName, _ := ssh_config.GetStrict(hostName, "User")
	var canonicalName string
	if userName != "" {
		canonicalName = userName + "@" + hostName
	} else {
		canonicalName = hostName
	}

	// check if canonicalname is okay
	m := userHostRe.FindStringSubmatch(canonicalName)
	if m == nil {
		return nil, fmt.Errorf("could not parse \"%s\" - %s did not fit user@host requirement", hostName, canonicalName)
	}

	portStr, _ := ssh_config.GetStrict(hostName, "Port")
	var portVal int
	if portStr != "" && portStr != "22" {
		canonicalName = canonicalName + ":" + portStr
		var err error
		portVal, err = strconv.Atoi(portStr)
		if err != nil {
			// do not make assumptions about port if incorrectly configured
			return nil, fmt.Errorf("could not parse \"%s\" (%s) - %s could not be converted to a valid port", hostName, canonicalName, portStr)
		}
		if portVal <= 0 || portVal > 65535 {
			return nil, fmt.Errorf("could not parse port \"%d\": number is not valid for a port", portVal)
		}
	}
	identityFile, _ := ssh_config.GetStrict(hostName, "IdentityFile")
	passwordAuth, _ := ssh_config.GetStrict(hostName, "PasswordAuthentication")
	proxyCommand, _ := ssh_config.GetStrict(hostName, "ProxyCommand") // Added ProxyCommand parsing

	cfgWaveOptionsStr, _ := ssh_config.GetStrict(hostName, "WaveOptions")
	cfgWaveOptionsStr = strings.ToLower(cfgWaveOptionsStr)
	cfgWaveOptions := make(map[string]string)
	setBracketArgs(cfgWaveOptions, cfgWaveOptionsStr)

	shouldIgnore := false
	if result, _ := strconv.ParseBool(cfgWaveOptions["ignore"]); result {
		shouldIgnore = true
	}

	var sshKeyFile string
	connectMode := sstore.ConnectModeAuto
	if cfgWaveOptions["connectmode"] == "manual" {
		connectMode = sstore.ConnectModeManual
	} else if _, err := os.Stat(base.ExpandHomeDir(identityFile)); err == nil {
		sshKeyFile = identityFile
	} else if passwordAuth == "yes" {
		connectMode = sstore.ConnectModeManual
	}

	shellPref := sstore.ShellTypePref_Detect
	if cfgWaveOptions["shellpref"] == "bash" {
		shellPref = "bash"
	} else if cfgWaveOptions["shellpref"] == "zsh" {
		shellPref = "zsh"
	}

	outHostInfo := new(HostInfoType)
	outHostInfo.Host = hostName
	outHostInfo.User = userName
	outHostInfo.CanonicalName = canonicalName
	outHostInfo.Port = portVal
	outHostInfo.SshKeyFile = sshKeyFile
	outHostInfo.ConnectMode = connectMode
	outHostInfo.Ignore = shouldIgnore
	outHostInfo.ShellPref = shellPref
	outHostInfo.ProxyCommand = proxyCommand // Pass ProxyCommand from SSH config
	return outHostInfo, nil
}

func crShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType, ids resolvedIds) (scbus.UpdatePacket, error) {
	var buf bytes.Buffer
	riArr, err := sstore.GetRIsForScreen(ctx, ids.SessionId, ids.ScreenId)
	if err != nil {
		return nil, fmt.Errorf("cannot get remote instances: %w", err)
	}
	if len(riArr) == 0 {
		update := scbus.MakeUpdatePacket()
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg: "this tab has no shell states",
		})
		return update, nil
	}
	for _, ri := range riArr {
		rptr := sstore.RemotePtrType{RemoteId: ri.RemoteId, Name: ri.Name}
		wsh := remote.GetRemoteById(ri.RemoteId)
		if wsh == nil {
			continue
		}
		baseDisplayName := wsh.GetDisplayName()
		displayName := rptr.GetDisplayName(baseDisplayName)
		cwdStr := "-"
		if ri.FeState["cwd"] != "" {
			cwdStr = ri.FeState["cwd"]
		}
		buf.WriteString(fmt.Sprintf("%-30s %-50s\n", displayName, cwdStr))
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: "shell states for tab",
		InfoLines: splitLinesForInfo(buf.String()),
	})
	return update, nil
}

func writeErrorToPty(cmd *sstore.CmdType, errStr string, outputPos int64) {
	errPk := openai.CreateErrorPacket(errStr)
	errBytes, err := packet.MarshalPacket(errPk)
	if err != nil {
		log.Printf("error writing error packet to openai response: %v\n", err)
		return
	}
	errCtx, cancelFn := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelFn()
	update, err := sstore.AppendToCmdPtyBlob(errCtx, cmd.ScreenId, cmd.LineId, errBytes, outputPos)
	if err != nil {
		log.Printf("error writing ptyupdate for openai response: %v\n", err)
		return
	}
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	return
}

func writePacketToPty(ctx context.Context, cmd *sstore.CmdType, pk packet.PacketType, outputPos *int64) error {
	outBytes, err := packet.MarshalPacket(pk)
	if err != nil {
		return err
	}
	update, err := sstore.AppendToCmdPtyBlob(ctx, cmd.ScreenId, cmd.LineId, outBytes, *outputPos)
	if err != nil {
		return err
	}
	*outputPos += int64(len(outBytes))
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	return nil
}

func writeTextToPty(ctx context.Context, cmd *sstore.CmdType, text string, outputPos *int64) error {
	if text == "" {
		return nil
	}
	outBytes := []byte(text)
	update, err := sstore.AppendToCmdPtyBlob(ctx, cmd.ScreenId, cmd.LineId, outBytes, *outputPos)
	if err != nil {
		return err
	}
	*outputPos += int64(len(outBytes))
	scbus.MainUpdateBus.DoScreenUpdate(cmd.ScreenId, update)
	return nil
}

// formatMarkdownForTerminal processes markdown text to make it more readable in a terminal
func formatMarkdownForTerminal(text string) string {
	// For now, we'll just preserve the text as-is
	// In the future, we could enhance this to better format code blocks
	return text
}

func CrCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, fmt.Errorf("/%s error: %w", GetCmdStr(pk), err)
	}
	newRemote := firstArg(pk)
	if newRemote == "" {
		return crShowCommand(ctx, pk, ids)
	}
	_, rptr, rstate, err := resolveRemote(ctx, newRemote, ids.SessionId, ids.ScreenId)
	if err != nil {
		return nil, err
	}
	if rptr == nil {
		return nil, fmt.Errorf("/%s error: remote %q not found", GetCmdStr(pk), newRemote)
	}
	if rstate.Archived {
		return nil, fmt.Errorf("/%s error: remote %q cannot switch to archived remote", GetCmdStr(pk), newRemote)
	}
	newWsh := remote.GetRemoteById(rptr.RemoteId)
	if newWsh == nil {
		return nil, fmt.Errorf("/%s error: remote %q not found (wsh)", GetCmdStr(pk), newRemote)
	}
	if !newWsh.IsConnected() {
		err := newWsh.TryAutoConnect()
		if err != nil {
			return nil, fmt.Errorf("%q is disconnected, auto-connect failed: %w", rstate.GetBaseDisplayName(), err)
		}
		if !newWsh.IsConnected() {
			if newWsh.GetRemoteCopy().ConnectMode == sstore.ConnectModeManual {
				return nil, fmt.Errorf("%q is disconnected (must manually connect)", rstate.GetBaseDisplayName())
			}
			return nil, fmt.Errorf("%q is disconnected", rstate.GetBaseDisplayName())
		}
	}
	err = sstore.UpdateCurRemote(ctx, ids.ScreenId, *rptr)
	if err != nil {
		return nil, fmt.Errorf("/%s error: cannot update curremote: %w", GetCmdStr(pk), err)
	}
	ri, err := sstore.GetRemoteStatePtr(ctx, ids.SessionId, ids.ScreenId, *rptr)
	if err != nil {
		return nil, fmt.Errorf("/%s error looking up connection state: %w", GetCmdStr(pk), err)
	}
	if ri == nil {
		// ok, if ri is nil we need to do a reinit
		verbose := resolveBool(pk.Kwargs["verbose"], false)
		shellType, err := resolveShellType(pk.Kwargs["shell"], rstate.DefaultShellType)
		if err != nil {
			return nil, err
		}
		termOpts, err := GetUITermOpts(pk.UIContext.WinSize, DefaultPTERM)
		if err != nil {
			return nil, fmt.Errorf("cannot make termopts: %w", err)
		}
		pkTermOpts := convertTermOpts(termOpts)
		cmd, err := makeDynCmd(ctx, "connect", ids, pk.GetRawStr(), *pkTermOpts, &makeDynCmdOpts{OverrideRPtr: rptr})
		if err != nil {
			return nil, err
		}
		update, err := addLineForCmd(ctx, "connect", true, ids, cmd, "", nil)
		if err != nil {
			return nil, err
		}
		cwdFromKwargs := pk.Kwargs["cwd"]
		log.Printf("[DEBUG CrCommand] connect command - Got cwd from kwargs: %s", cwdFromKwargs)
		opts := connectOptsType{
			Verbose:    verbose,
			ShellType:  shellType,
			SessionId:  ids.SessionId,
			ScreenId:   ids.ScreenId,
			RPtr:       *rptr,
			InitialCwd: cwdFromKwargs,
		}
		go doAsyncResetCommand(newWsh, opts, cmd)
		return update, nil
	} else {
		outputStr := fmt.Sprintf("reconnected to %s", GetFullRemoteDisplayName(rptr, rstate))
		cmd, err := makeStaticCmd(ctx, GetCmdStr(pk), ids, pk.GetRawStr(), []byte(outputStr))
		if err != nil {
			// TODO tricky error since the command was a success, but we can't show the output
			return nil, err
		}
		update, err := addLineForCmd(ctx, "/"+GetCmdStr(pk), false, ids, cmd, "", nil)
		if err != nil {
			// TODO tricky error since the command was a success, but we can't show the output
			return nil, err
		}
		update.AddUpdate(sstore.InteractiveUpdate(pk.Interactive))
		return update, nil
	}
}

type makeDynCmdOpts struct {
	OverrideRPtr *sstore.RemotePtrType
}

func makeDynCmd(ctx context.Context, metaCmd string, ids resolvedIds, cmdStr string, termOpts sstore.TermOpts, opts *makeDynCmdOpts) (*sstore.CmdType, error) {
	var rptr scpacket.RemotePtrType
	if opts != nil && opts.OverrideRPtr != nil {
		rptr = *opts.OverrideRPtr
	} else if ids.Remote != nil {
		rptr = ids.Remote.RemotePtr
	} else {
		local := remote.GetLocalRemote()
		rptr = scpacket.RemotePtrType{RemoteId: local.RemoteId}
	}
	cmd := &sstore.CmdType{
		ScreenId:  ids.ScreenId,
		LineId:    scbase.GenWaveUUID(),
		CmdStr:    cmdStr,
		RawCmdStr: cmdStr,
		Remote:    rptr,
		TermOpts:  termOpts,
		Status:    sstore.CmdStatusRunning,
		RunOut:    nil,
	}
	if ids.Remote != nil && ids.Remote.StatePtr != nil {
		cmd.StatePtr = *ids.Remote.StatePtr
	}
	if ids.Remote != nil && ids.Remote.FeState != nil {
		cmd.FeState = ids.Remote.FeState
	}
	err := sstore.CreateCmdPtyFile(ctx, cmd.ScreenId, cmd.LineId, cmd.TermOpts.MaxPtySize)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, fmt.Errorf("cannot create local ptyout file for %s command: %w", metaCmd, err)
	}
	return cmd, nil
}

func makeStaticCmd(ctx context.Context, metaCmd string, ids resolvedIds, cmdStr string, cmdOutput []byte) (*sstore.CmdType, error) {
	cmd := &sstore.CmdType{
		ScreenId:  ids.ScreenId,
		LineId:    scbase.GenWaveUUID(),
		CmdStr:    cmdStr,
		RawCmdStr: cmdStr,
		Remote:    ids.Remote.RemotePtr,
		TermOpts:  sstore.TermOpts{Rows: shellutil.DefaultTermRows, Cols: shellutil.DefaultTermCols, FlexRows: true, MaxPtySize: remote.DefaultMaxPtySize},
		Status:    sstore.CmdStatusDone,
		RunOut:    nil,
	}
	if ids.Remote.StatePtr != nil {
		cmd.StatePtr = *ids.Remote.StatePtr
	}
	if ids.Remote.FeState != nil {
		cmd.FeState = ids.Remote.FeState
	}
	err := sstore.CreateCmdPtyFile(ctx, cmd.ScreenId, cmd.LineId, cmd.TermOpts.MaxPtySize)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, fmt.Errorf("cannot create local ptyout file for %s command: %w", metaCmd, err)
	}
	// can ignore ptyupdate
	_, err = sstore.AppendToCmdPtyBlob(ctx, ids.ScreenId, cmd.LineId, cmdOutput, 0)
	if err != nil {
		// TODO tricky error since the command was a success, but we can't show the output
		return nil, fmt.Errorf("cannot append to local ptyout file for %s command: %v", metaCmd, err)
	}
	return cmd, nil
}

func addLineForCmd(ctx context.Context, metaCmd string, shouldFocus bool, ids resolvedIds, cmd *sstore.CmdType, renderer string, lineState map[string]any) (*scbus.ModelUpdatePacketType, error) {
	rtnLine, err := sstore.AddCmdLine(ctx, ids.ScreenId, DefaultUserId, cmd, renderer, lineState)
	if err != nil {
		return nil, err
	}
	// sendRendererActivityUpdate(renderer)
	screen, err := sstore.GetScreenById(ctx, ids.ScreenId)
	if err != nil {
		// ignore error here, because the command has already run (nothing to do)
		log.Printf("%s error getting screen: %v\n", metaCmd, err)
	}
	if screen != nil {
		updateMap := make(map[string]interface{})
		updateMap[sstore.ScreenField_SelectedLine] = rtnLine.LineNum
		if shouldFocus {
			updateMap[sstore.ScreenField_Focus] = sstore.ScreenFocusCmd
		}
		screen, err = sstore.UpdateScreen(ctx, ids.ScreenId, updateMap)
		if err != nil {
			// ignore error again (nothing to do)
			log.Printf("%s error updating screen selected line: %v\n", metaCmd, err)
		}
	}
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, rtnLine, cmd)
	update.AddUpdate(*screen)
	if cmd.Status == sstore.CmdStatusRunning {
		go sstore.IncrementNumRunningCmds(cmd.ScreenId, 1)
	}
	updateHistoryContext(ctx, rtnLine, cmd, cmd.FeState)
	return update, nil
}

func updateHistoryContext(ctx context.Context, line *sstore.LineType, cmd *sstore.CmdType, feState sstore.FeStateType) {
	ctxVal := ctx.Value(historyContextKey)
	if ctxVal == nil {
		return
	}
	hctx := ctxVal.(*historyContextType)
	if line != nil {
		hctx.LineId = line.LineId
		hctx.LineNum = line.LineNum
	}
	if cmd != nil {
		hctx.RemotePtr = &cmd.Remote
		hctx.InitialStatus = cmd.Status
	} else {
		hctx.InitialStatus = sstore.CmdStatusDone
	}
	hctx.FeState = feState
}

func makeInfoFromComps(compType string, comps []string, hasMore bool) scbus.UpdatePacket {
	sort.Slice(comps, func(i int, j int) bool {
		c1 := comps[i]
		c2 := comps[j]
		c1mc := strings.HasPrefix(c1, "^")
		c2mc := strings.HasPrefix(c2, "^")
		if c1mc && !c2mc {
			return true
		}
		if !c1mc && c2mc {
			return false
		}
		return c1 < c2
	})
	if len(comps) == 0 {
		comps = []string{"(no completions)"}
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle:     fmt.Sprintf("%s completions", compType),
		InfoComps:     comps,
		InfoCompsMore: hasMore,
	})
	return update
}

func simpleCompCommandMeta(ctx context.Context, prefix string, compCtx comp.CompContext, args []interface{}) (*comp.CompReturn, error) {
	if strings.HasPrefix(prefix, "/") {
		compsCmd, _ := comp.DoSimpleComp(ctx, comp.CGTypeCommand, prefix, compCtx, nil)
		compsMeta, _ := simpleCompMeta(ctx, prefix, compCtx, nil)
		return comp.CombineCompReturn(comp.CGTypeCommandMeta, compsCmd, compsMeta), nil
	} else {
		compsCmd, _ := comp.DoSimpleComp(ctx, comp.CGTypeCommand, prefix, compCtx, nil)
		compsBareCmd, _ := simpleCompBareCmds(ctx, prefix, compCtx, nil)
		return comp.CombineCompReturn(comp.CGTypeCommand, compsCmd, compsBareCmd), nil
	}
}

func simpleCompBareCmds(ctx context.Context, prefix string, compCtx comp.CompContext, args []interface{}) (*comp.CompReturn, error) {
	rtn := comp.CompReturn{}
	for _, bmc := range BareMetaCmds {
		if strings.HasPrefix(bmc.CmdStr, prefix) {
			rtn.Entries = append(rtn.Entries, comp.CompEntry{Word: bmc.CmdStr, IsMetaCmd: true})
		}
	}
	return &rtn, nil
}

func simpleCompMeta(ctx context.Context, prefix string, compCtx comp.CompContext, args []interface{}) (*comp.CompReturn, error) {
	rtn := comp.CompReturn{}
	validCommands := getValidCommands()
	for _, cmd := range validCommands {
		if strings.HasPrefix(cmd, "/_") && !strings.HasPrefix(prefix, "/_") {
			continue
		}
		if strings.HasPrefix(cmd, prefix) {
			rtn.Entries = append(rtn.Entries, comp.CompEntry{Word: cmd, IsMetaCmd: true})
		}
	}
	return &rtn, nil
}

func doMetaCompGen(ctx context.Context, pk *scpacket.FeCommandPacketType, prefix string, forDisplay bool) ([]string, bool, error) {
	ids, err := resolveUiIds(ctx, pk, 0) // best effort
	var comps []string
	var hasMore bool
	if ids.Remote != nil && ids.Remote.RState.IsConnected() {
		comps, hasMore, err = doCompGen(ctx, pk, prefix, "file", forDisplay)
		if err != nil {
			return nil, false, err
		}
	}
	validCommands := getValidCommands()
	for _, cmd := range validCommands {
		if strings.HasPrefix(cmd, prefix) {
			if forDisplay {
				comps = append(comps, "^"+cmd)
			} else {
				comps = append(comps, cmd)
			}
		}
	}
	return comps, hasMore, nil
}

func doCompGen(ctx context.Context, pk *scpacket.FeCommandPacketType, prefix string, compType string, forDisplay bool) ([]string, bool, error) {
	if compType == "metacommand" {
		return doMetaCompGen(ctx, pk, prefix, forDisplay)
	}
	if !packet.IsValidCompGenType(compType) {
		return nil, false, fmt.Errorf("/_compgen invalid type '%s'", compType)
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, false, fmt.Errorf("/_compgen error: %w", err)
	}
	cgPacket := packet.MakeCompGenPacket()
	cgPacket.ReqId = uuid.New().String()
	cgPacket.CompType = compType
	cgPacket.Prefix = prefix
	cgPacket.Cwd = ids.Remote.FeState["cwd"]
	resp, err := ids.Remote.Waveshell.PacketRpc(ctx, cgPacket)
	if err != nil {
		return nil, false, err
	}
	if err = resp.Err(); err != nil {
		return nil, false, err
	}
	comps := utilfn.GetStrArr(resp.Data, "comps")
	hasMore := utilfn.GetBool(resp.Data, "hasmore")
	return comps, hasMore, nil
}

func CompFileDirCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, 0) // best-effort
	if err != nil {
		return nil, fmt.Errorf("/_compfiledir error: %w", err)
	}

	comptype := pk.Kwargs["comptype"]

	if comptype != comp.CGTypeFile && comptype != comp.CGTypeDir {
		return nil, fmt.Errorf("/_compfiledir invalid comptype '%s'", comptype)
	}

	compCtx := comp.CompContext{}
	if ids.Remote != nil {
		rptr := ids.Remote.RemotePtr
		compCtx.RemotePtr = &rptr
		if pk.Kwargs["cwd"] != "" {
			compCtx.Cwd = pk.Kwargs["cwd"]
		} else if ids.Remote.FeState != nil {
			compCtx.Cwd = ids.Remote.FeState["cwd"]
		}
	}

	crtn, err := comp.DoSimpleComp(ctx, comptype, "", compCtx, nil)
	if err != nil {
		return nil, err
	}
	if crtn == nil {
		return nil, nil
	}
	compStrs := crtn.GetCompDisplayStrs()
	return makeInfoFromComps(crtn.CompType, compStrs, crtn.HasMore), nil
}

func CompGenCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, 0) // best-effort
	if err != nil {
		return nil, fmt.Errorf("/_compgen error: %w", err)
	}
	cmdLine := firstArg(pk)
	pos := len(cmdLine)
	if pk.Kwargs["comppos"] != "" {
		posArg, err := strconv.Atoi(pk.Kwargs["comppos"])
		if err != nil {
			return nil, fmt.Errorf("/_compgen invalid comppos '%s': %w", pk.Kwargs["comppos"], err)
		}
		pos = posArg
	}
	if pos < 0 {
		pos = 0
	}
	if pos > len(cmdLine) {
		pos = len(cmdLine)
	}
	showComps := resolveBool(pk.Kwargs["compshow"], false)
	cmdSP := utilfn.StrWithPos{Str: cmdLine, Pos: pos}
	compCtx := comp.CompContext{}
	if ids.Remote != nil {
		rptr := ids.Remote.RemotePtr
		compCtx.RemotePtr = &rptr
		if ids.Remote.FeState != nil {
			compCtx.Cwd = ids.Remote.FeState["cwd"]
		}
	}
	compCtx.ForDisplay = showComps
	crtn, newSP, err := comp.DoCompGen(ctx, cmdSP, compCtx)
	if err != nil {
		return nil, err
	}
	if crtn == nil {
		return nil, nil
	}
	if showComps {
		compStrs := crtn.GetCompDisplayStrs()
		return makeInfoFromComps(crtn.CompType, compStrs, crtn.HasMore), nil
	}
	if newSP == nil || cmdSP == *newSP {
		return nil, nil
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.CmdLineUpdate(utilfn.StrWithPos{Str: newSP.Str, Pos: newSP.Pos}))
	return update, nil
}

func CommentCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, fmt.Errorf("/comment error: %w", err)
	}
	text := firstArg(pk)
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("cannot post empty comment")
	}
	rtnLine, err := sstore.AddCommentLine(ctx, ids.ScreenId, DefaultUserId, text)
	if err != nil {
		return nil, err
	}
	updateHistoryContext(ctx, rtnLine, nil, nil)
	updateMap := make(map[string]interface{})
	updateMap[sstore.ScreenField_SelectedLine] = rtnLine.LineNum
	updateMap[sstore.ScreenField_Focus] = sstore.ScreenFocusInput
	screen, err := sstore.UpdateScreen(ctx, ids.ScreenId, updateMap)
	if err != nil {
		// ignore error again (nothing to do)
		log.Printf("/comment error updating screen selected line: %v\n", err)
	}
	update := scbus.MakeUpdatePacket()
	sstore.AddLineUpdate(update, rtnLine, nil)
	update.AddUpdate(*screen)
	return update, nil
}

func maybeQuote(s string, quote bool) string {
	if quote {
		return fmt.Sprintf("%q", s)
	}
	return s
}

func mapToStrs(m map[string]bool) []string {
	var rtn []string
	for key, val := range m {
		if val {
			rtn = append(rtn, key)
		}
	}
	return rtn
}

func formatStrs(strs []string, conj string, quote bool) string {
	if len(strs) == 0 {
		return "(none)"
	}
	if len(strs) == 1 {
		return maybeQuote(strs[0], quote)
	}
	if len(strs) == 2 {
		return fmt.Sprintf("%s %s %s", maybeQuote(strs[0], quote), conj, maybeQuote(strs[1], quote))
	}
	var buf bytes.Buffer
	for idx := 0; idx < len(strs)-1; idx++ {
		buf.WriteString(maybeQuote(strs[idx], quote))
		buf.WriteString(", ")
	}
	buf.WriteString(conj)
	buf.WriteString(" ")
	buf.WriteString(maybeQuote(strs[len(strs)-1], quote))
	return buf.String()
}

func validateName(name string, typeStr string) error {
	if len(name) > MaxNameLen {
		return fmt.Errorf("%s name too long, max length is %d", typeStr, MaxNameLen)
	}
	if !genericNameRe.MatchString(name) {
		return fmt.Errorf("invalid %s name", typeStr)
	}
	return nil
}

func validateShareName(name string) error {
	if len(name) > MaxShareNameLen {
		return fmt.Errorf("share name too long, max length is %d", MaxShareNameLen)
	}
	for _, ch := range name {
		if !unicode.IsPrint(ch) {
			return fmt.Errorf("invalid character %q in share name", string(ch))
		}
	}
	return nil
}

func validateRenderer(renderer string) error {
	if renderer == "" {
		return nil
	}
	if len(renderer) > MaxRendererLen {
		return fmt.Errorf("renderer name too long, max length is %d", MaxRendererLen)
	}
	if !rendererRe.MatchString(renderer) {
		return fmt.Errorf("invalid renderer format")
	}
	return nil
}

func validateColor(color string, typeStr string) error {
	for _, c := range sstore.TabColors {
		if color == c {
			return nil
		}
	}
	return fmt.Errorf("invalid %s, valid colors are: %s", typeStr, formatStrs(sstore.TabColors, "or", false))
}

func validateRemoteColor(color string, typeStr string) error {
	for _, c := range RemoteColorNames {
		if color == c {
			return nil
		}
	}
	return fmt.Errorf("invalid %s, valid colors are: %s", typeStr, formatStrs(RemoteColorNames, "or", false))
}

func makeExternLink(urlStr string) string {
	return fmt.Sprintf(`https://extern?%s`, url.QueryEscape(urlStr))
}

func SleepCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	sleepTimeLimit := 10000
	if len(pk.Args) < 1 {
		return nil, fmt.Errorf("no argument found - usage: /sleep [ms]")
	}
	sleepArg := pk.Args[0]
	sleepArgInt, err := strconv.Atoi(sleepArg)
	if err != nil {
		return nil, fmt.Errorf("couldn't parse sleep arg: %v", err)
	}
	if sleepArgInt > sleepTimeLimit {
		return nil, fmt.Errorf("sleep arg is too long, max value is %v", sleepTimeLimit)
	}
	time.Sleep(time.Duration(sleepArgInt) * time.Millisecond)
	update := scbus.MakeUpdatePacket()
	return update, nil
}

func MainViewCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) < 1 {
		return nil, fmt.Errorf("no argument found - usage: /mainview [view]")
	}
	update := scbus.MakeUpdatePacket()
	mainViewArg := pk.Args[0]
	if mainViewArg == sstore.MainViewSession {
		update.AddUpdate(&MainViewUpdate{MainView: sstore.MainViewSession})
	} else if mainViewArg == sstore.MainViewConnections {
		update.AddUpdate(&MainViewUpdate{MainView: sstore.MainViewConnections})
	} else if mainViewArg == sstore.MainViewSettings {
		update.AddUpdate(&MainViewUpdate{MainView: sstore.MainViewSettings})
	} else if mainViewArg == sstore.MainViewHistory {
		return nil, fmt.Errorf("use /history instead")
	} else if mainViewArg == sstore.MainViewBookmarks {
		return nil, fmt.Errorf("use /bookmarks instead")
	} else {
		return nil, fmt.Errorf("unrecognized main view")
	}
	return update, nil
}

type statePtrInfoType struct {
	IsDiff    bool
	BaseHash  string
	DiffHash  string
	StateSize int
}

func getStatePtrInfo(ctx context.Context, statePtr *packet.ShellStatePtr) (statePtrInfoType, error) {
	rtn := statePtrInfoType{}
	if statePtr == nil {
		return rtn, fmt.Errorf("stateptr is nil")
	}
	if len(statePtr.DiffHashArr) > 1 {
		return rtn, fmt.Errorf("stateptr has more than 1 diffhash")
	}
	if len(statePtr.DiffHashArr) == 1 {
		rtn.IsDiff = true
		rtn.BaseHash = statePtr.BaseHash
		rtn.DiffHash = statePtr.DiffHashArr[0]
		stateDiff, err := sstore.GetStateDiff(ctx, rtn.DiffHash)
		if err != nil {
			return rtn, fmt.Errorf("cannot get state diff: %w", err)
		}
		_, encodedDiff := stateDiff.EncodeAndHash()
		rtn.StateSize = len(encodedDiff)
	} else {
		rtn.BaseHash = statePtr.BaseHash
		state, err := sstore.GetStateBase(ctx, rtn.BaseHash)
		if err != nil {
			return rtn, fmt.Errorf("cannot get state base: %w", err)
		}
		_, encodedState := state.EncodeAndHash()
		rtn.StateSize = len(encodedState)
	}
	return rtn, nil
}

func DebugRemoteInstanceCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	slines, err := sstore.GetScreenLinesById(ctx, ids.ScreenId)
	if err != nil {
		return nil, err
	}
	lines := slines.Lines
	if len(lines) > 100 {
		lines = lines[:100]
	}
	cmdMap := make(map[string]*sstore.CmdType)
	for _, cmd := range slines.Cmds {
		cmdMap[cmd.LineId] = cmd
	}
	cmds := make([]*sstore.CmdType, 0, len(lines))
	for _, line := range lines {
		cmds = append(cmds, cmdMap[line.LineId])
	}
	var outputLines []string
	for idx, cmd := range cmds {
		if cmd == nil || cmd.RtnStatePtr.IsEmpty() {
			continue
		}
		line := lines[idx]
		info, err := getStatePtrInfo(ctx, &cmd.RtnStatePtr)
		if err != nil {
			outputLines = append(outputLines, fmt.Sprintf("line %5d | err %v", line.LineNum, err))
			continue
		}
		outputStr := ""
		if info.IsDiff {
			outputStr = fmt.Sprintf("line %5d | diff %8s-%8s | size %8d", line.LineNum, info.BaseHash[0:8], info.DiffHash[0:8], info.StateSize)
		} else {
			outputStr = fmt.Sprintf("line %5d | base %8s %8s | size %8d", line.LineNum, info.BaseHash[0:8], "", info.StateSize)
		}
		outputLines = append(outputLines, outputStr)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: "remote instance",
		InfoLines: outputLines,
	})
	return update, nil
}

func ClearSudoCache(ctx context.Context, pk *scpacket.FeCommandPacketType) (rtnUpdate scbus.UpdatePacket, rtnErr error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	ids.Remote.Waveshell.ClearCachedSudoPw()
	pluralize := ""

	clearAll := resolveBool(pk.Kwargs["all"], false)
	if clearAll {
		for _, proc := range remote.GetRemoteMap() {
			proc.ClearCachedSudoPw()
		}
		pluralize = "s"
	}

	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("sudo password%s cleared", pluralize),
		TimeoutMs: 2000,
	})
	return update, nil
}

type connectOptsType struct {
	ShellType  string // shell type to connect with
	Verbose    bool   // extra output (show state changes, sizes, etc.)
	SessionId  string
	ScreenId   string
	RPtr       sstore.RemotePtrType
	InitialCwd string // initial working directory
}

// this does the asynchroneous part of the connection reset
func doAsyncResetCommand(wsh *remote.WaveshellProc, opts connectOptsType, cmd *sstore.CmdType) {
	ctx, cancelFn := context.WithCancel(context.Background())
	defer cancelFn()
	startTime := time.Now()
	var outputPos int64
	var rtnErr error
	exitSuccess := true
	defer func() {
		if rtnErr != nil {
			exitSuccess = false
			writeStringToPty(ctx, cmd, fmt.Sprintf("\r\nerror: %v", rtnErr), &outputPos)
		}
		deferWriteCmdStatus(ctx, cmd, startTime, exitSuccess, outputPos)
	}()
	dataFn := func(data []byte) {
		writeStringToPty(ctx, cmd, string(data), &outputPos)
	}
	origStatePtr, _ := sstore.GetRemoteStatePtr(ctx, opts.SessionId, opts.ScreenId, opts.RPtr)
	ssPk, err := wsh.ReInit(ctx, base.MakeCommandKey(cmd.ScreenId, cmd.LineId), opts.ShellType, dataFn, opts.Verbose)
	if err != nil {
		rtnErr = err
		return
	}
	if ssPk == nil || ssPk.State == nil {
		rtnErr = fmt.Errorf("no state received from connection (nil)")
		return
	}
	feState := sstore.FeStateFromShellState(ssPk.State)
	log.Printf("[DEBUG doAsyncResetCommand] feState[cwd]=%v, ssPk.State.Cwd=%s, opts.InitialCwd=%s",
		feState["cwd"], ssPk.State.Cwd, opts.InitialCwd)

	// If initial cwd is specified, create a state diff to change it
	var stateDiff *packet.ShellStateDiff
	if opts.InitialCwd != "" && opts.InitialCwd != sstore.DefaultCwd && opts.InitialCwd != ssPk.State.Cwd {
		stateDiff = &packet.ShellStateDiff{
			BaseHash: ssPk.State.GetHashVal(false),
			Version:  ssPk.State.Version,
			Cwd:      opts.InitialCwd,
		}
		stateDiff.GetHashVal(true) // compute the hash for the diff
		feState["cwd"] = opts.InitialCwd
		log.Printf("[DEBUG doAsyncResetCommand] Creating state diff with cwd=%s, hash=%s", opts.InitialCwd, stateDiff.HashVal)
	}

	// If we have a state diff, don't pass the state (can't pass both)
	var stateToPass *packet.ShellState
	if stateDiff == nil {
		stateToPass = ssPk.State
	}
	remoteInst, err := sstore.UpdateRemoteState(ctx, opts.SessionId, opts.ScreenId, opts.RPtr, feState, stateToPass, stateDiff)
	if err != nil {
		rtnErr = err
		return
	}

	newStatePtr := packet.ShellStatePtr{
		BaseHash: ssPk.State.GetHashVal(false),
	}
	if opts.Verbose && origStatePtr != nil {
		statePtrDiff := fmt.Sprintf("oldstate: %v, newstate: %v\r\n", origStatePtr.BaseHash, newStatePtr.BaseHash)
		writeStringToPty(ctx, cmd, statePtrDiff, &outputPos)
		origFullState, _ := sstore.GetFullState(ctx, *origStatePtr)
		newFullState, _ := sstore.GetFullState(ctx, newStatePtr)
		if origFullState != nil && newFullState != nil {
			var diffBuf bytes.Buffer
			rtnstate.DisplayStateUpdateDiff(&diffBuf, *origFullState, *newFullState)
			diffStr := diffBuf.String()
			diffStr = strings.ReplaceAll(diffStr, "\n", "\r\n")
			writeStringToPty(ctx, cmd, diffStr, &outputPos)
		}
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.MakeSessionUpdateForRemote(opts.SessionId, remoteInst))
	scbus.MainUpdateBus.DoUpdate(update)
}

func ResetCwdCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	statePtr, err := sstore.GetRemoteStatePtr(ctx, ids.SessionId, ids.ScreenId, ids.Remote.RemotePtr)
	if err != nil {
		return nil, err
	}
	if statePtr == nil {
		return nil, fmt.Errorf("no shell state found, cannot reset cwd (run /reset)")
	}
	stateDiff, err := sstore.GetCurStateDiffFromPtr(ctx, statePtr)
	if err != nil {
		return nil, err
	}
	feState := ids.Remote.FeState
	feState["cwd"] = "~"
	stateDiff.Cwd = "~"
	stateDiff.GetHashVal(true)
	remoteInst, err := sstore.UpdateRemoteState(ctx, ids.SessionId, ids.ScreenId, ids.Remote.RemotePtr, feState, nil, stateDiff)
	if err != nil {
		return nil, fmt.Errorf("could not update remote state: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.MakeSessionUpdateForRemote(ids.SessionId, remoteInst), sstore.InteractiveUpdate(pk.Interactive))
	update.AddUpdate(sstore.InfoMsgType{InfoMsg: "reset cwd to ~"})
	return update, nil
}

func ClearCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if resolveBool(pk.Kwargs["archive"], false) {
		update, err := sstore.ArchiveScreenLines(ctx, ids.ScreenId)
		if err != nil {
			return nil, fmt.Errorf("clearing screen (archiving): %v", err)
		}
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg:   fmt.Sprintf("screen cleared (all lines archived)"),
			TimeoutMs: 2000,
		})
		return update, nil
	} else {
		update, err := sstore.DeleteScreenLines(ctx, ids.ScreenId)
		if err != nil {
			return nil, fmt.Errorf("clearing screen: %v", err)
		}
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg:   fmt.Sprintf("screen cleared"),
			TimeoutMs: 2000,
		})
		return update, nil
	}

}

const DefaultMaxHistoryItems = 10000

func splitLinesForInfo(str string) []string {
	rtn := strings.Split(str, "\n")
	if rtn[len(rtn)-1] == "" {
		return rtn[:len(rtn)-1]
	}
	return rtn
}

func resizeRunningCommand(ctx context.Context, cmd *sstore.CmdType, newCols int) error {
	feInput := scpacket.MakeFeInputPacket()
	feInput.CK = base.MakeCommandKey(cmd.ScreenId, cmd.LineId)
	feInput.WinSize = &packet.WinSize{Rows: int(cmd.TermOpts.Rows), Cols: newCols}
	wsh := remote.GetRemoteById(cmd.Remote.RemoteId)
	if wsh == nil {
		return fmt.Errorf("cannot resize, cmd remote not found")
	}
	err := wsh.HandleFeInput(feInput)
	if err != nil {
		return err
	}
	newTermOpts := cmd.TermOpts
	newTermOpts.Cols = int64(newCols)
	err = sstore.UpdateCmdTermOpts(ctx, cmd.ScreenId, cmd.LineId, newTermOpts)
	if err != nil {
		return err
	}
	return nil
}

func focusScreenLine(ctx context.Context, screenId string, lineNum int64) (*sstore.ScreenType, error) {
	screen, err := sstore.GetScreenById(ctx, screenId)
	if err != nil {
		return nil, fmt.Errorf("error getting screen: %v", err)
	}
	if screen == nil {
		return nil, fmt.Errorf("screen not found")
	}
	updateMap := make(map[string]interface{})
	updateMap[sstore.ScreenField_SelectedLine] = lineNum
	updateMap[sstore.ScreenField_Focus] = sstore.ScreenFocusCmd
	screen, err = sstore.UpdateScreen(ctx, screenId, updateMap)
	if err != nil {
		return nil, fmt.Errorf("error updating screen: %v", err)
	}
	return screen, nil
}

// func sendRendererActivityUpdate(renderer string) {
// 	if renderer == "" || !telemetry.IsAllowedRenderer(renderer) {
// 		return
// 	}
// 	activity := telemetry.ActivityUpdate{Renderers: make(map[string]int)}
// 	activity.Renderers[renderer] = 1
// 	telemetry.GoUpdateActivityWrap(activity, "renderer")
// }

func SetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	var setMap map[string]map[string]string
	setMap = make(map[string]map[string]string)
	_, err := resolveUiIds(ctx, pk, 0) // best effort
	if err != nil {
		return nil, err
	}
	for argIdx, rawArgVal := range pk.Args {
		eqIdx := strings.Index(rawArgVal, "=")
		if eqIdx == -1 {
			return nil, fmt.Errorf("/set invalid argument %d, does not contain an '='", argIdx)
		}
		argName := rawArgVal[:eqIdx]
		argVal := rawArgVal[eqIdx+1:]
		ok, scopeName, varName := resolveSetArg(argName)
		if !ok {
			return nil, fmt.Errorf("/set invalid setvar %q", argName)
		}
		if _, ok := setMap[scopeName]; !ok {
			setMap[scopeName] = make(map[string]string)
		}
		setMap[scopeName][varName] = argVal
	}
	return nil, nil
}

func makeStreamFilePk(ids resolvedIds, pk *scpacket.FeCommandPacketType) (*packet.StreamFilePacketType, error) {
	cwd := ids.Remote.FeState["cwd"]
	fileArg := pk.Args[0]
	if fileArg == "" {
		return nil, fmt.Errorf("/view:stat file argument must be set (cannot be empty)")
	}
	streamPk := packet.MakeStreamFilePacket()
	streamPk.ReqId = uuid.New().String()
	if filepath.IsAbs(fileArg) {
		streamPk.Path = fileArg
	} else {
		streamPk.Path = filepath.Join(cwd, fileArg)
	}
	return streamPk, nil
}

func MakeReadFileUrl(screenId string, lineId string, filePath string) (string, error) {
	qvals := make(url.Values)
	qvals.Set("screenid", screenId)
	qvals.Set("lineid", lineId)
	qvals.Set("path", filePath)
	qvals.Set("nonce", uuid.New().String())
	hmacStr, err := waveenc.ComputeUrlHmac([]byte(scbase.WaveAuthKey), "/api/read-file", qvals)
	if err != nil {
		return "", fmt.Errorf("error computing hmac-url: %v", err)
	}
	qvals.Set("hmac", hmacStr)
	return "/api/read-file?" + qvals.Encode(), nil
}

func EditTestCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/edit:test requires an argument (file name)")
	}
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_RemoteConnected)
	if err != nil {
		return nil, err
	}
	content, ok := pk.Kwargs["content"]
	if !ok {
		return nil, fmt.Errorf("/edit:test no content for file specified")
	}
	fileArg := pk.Args[0]
	if fileArg == "" {
		return nil, fmt.Errorf("/view:stat file argument must be set (cannot be empty)")
	}
	writePk := packet.MakeWriteFilePacket()
	writePk.ReqId = uuid.New().String()
	writePk.UseTemp = true
	cwd := ids.Remote.FeState["cwd"]
	if filepath.IsAbs(fileArg) {
		writePk.Path = fileArg
	} else {
		writePk.Path = filepath.Join(cwd, fileArg)
	}
	wsh := ids.Remote.Waveshell
	iter, err := wsh.PacketRpcIter(ctx, writePk)
	if err != nil {
		return nil, fmt.Errorf("/edit:test error: %v", err)
	}
	// first packet should be WriteFileReady
	readyIf, err := iter.Next(ctx)
	if err != nil {
		return nil, fmt.Errorf("/edit:test error while getting ready response: %w", err)
	}
	readyPk, ok := readyIf.(*packet.WriteFileReadyPacketType)
	if !ok {
		return nil, fmt.Errorf("/edit:test bad ready packet received: %T", readyIf)
	}
	if readyPk.Error != "" {
		return nil, fmt.Errorf("/edit:test %s", readyPk.Error)
	}
	dataPk := packet.MakeFileDataPacket(writePk.ReqId)
	dataPk.Data = []byte(content)
	dataPk.Eof = true
	err = wsh.SendFileData(dataPk)
	if err != nil {
		return nil, fmt.Errorf("/edit:test error sending data packet: %v", err)
	}
	doneIf, err := iter.Next(ctx)
	if err != nil {
		return nil, fmt.Errorf("/edit:test error while getting done response: %w", err)
	}
	donePk, ok := doneIf.(*packet.WriteFileDonePacketType)
	if !ok {
		return nil, fmt.Errorf("/edit:test bad done packet received: %T", doneIf)
	}
	if donePk.Error != "" {
		return nil, fmt.Errorf("/edit:test %s", donePk.Error)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: fmt.Sprintf("edit test, wrote %q", writePk.Path),
	})
	return update, nil
}

func SignalCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen)
	if err != nil {
		return nil, err
	}
	if len(pk.Args) == 0 {
		return nil, fmt.Errorf("/signal requires a first argument (line number or id)")
	}
	if len(pk.Args) == 1 {
		return nil, fmt.Errorf("/signal requires a second argument (signal name)")
	}
	lineArg := pk.Args[0]
	lineId, err := sstore.FindLineIdByArg(ctx, ids.ScreenId, lineArg)
	if err != nil {
		return nil, fmt.Errorf("error looking up lineid: %v", err)
	}
	line, cmd, err := sstore.GetLineCmdByLineId(ctx, ids.ScreenId, lineId)
	if err != nil {
		return nil, fmt.Errorf("error getting line: %v", err)
	}
	if line == nil {
		return nil, fmt.Errorf("line %q not found", lineArg)
	}
	if cmd == nil {
		return nil, fmt.Errorf("line %q does not have a command", lineArg)
	}
	if cmd.Status != sstore.CmdStatusRunning {
		return nil, fmt.Errorf("line %q command is not running, cannot send signal", lineArg)
	}
	sigArg := pk.Args[1]
	if isAllDigits(sigArg) {
		val, _ := strconv.Atoi(sigArg)
		if val <= 0 || val > MaxSignalNum {
			return nil, fmt.Errorf("signal number is out of bounds: %q", sigArg)
		}
	} else if !strings.HasPrefix(sigArg, "SIG") {
		sigArg = "SIG" + sigArg
	}
	sigArg = strings.ToUpper(sigArg)
	if len(sigArg) > 12 {
		return nil, fmt.Errorf("invalid signal (too long): %q", sigArg)
	}
	if !sigNameRe.MatchString(sigArg) {
		return nil, fmt.Errorf("invalid signal name/number: %q", sigArg)
	}
	wsh := remote.GetRemoteById(cmd.Remote.RemoteId)
	if wsh == nil {
		return nil, fmt.Errorf("cannot send signal, no remote found for command")
	}
	if !wsh.IsConnected() {
		return nil, fmt.Errorf("cannot send signal, remote is not connected")
	}
	inputPk := scpacket.MakeFeInputPacket()
	inputPk.CK = base.MakeCommandKey(cmd.ScreenId, cmd.LineId)
	inputPk.SigName = sigArg
	err = wsh.HandleFeInput(inputPk)
	if err != nil {
		return nil, fmt.Errorf("cannot send signal: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgUpdate("sent line %s signal %s", lineArg, sigArg))
	return update, nil
}

func KillServerCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	go func() {
		log.Printf("received /killserver, shutting down\n")
		time.Sleep(1 * time.Second)
		syscall.Kill(syscall.Getpid(), syscall.SIGINT)
	}()
	return nil, nil
}

func DumpStateCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	ids, err := resolveUiIds(ctx, pk, R_Session|R_Screen|R_Remote)
	if err != nil {
		return nil, err
	}
	currentState, err := sstore.GetFullState(ctx, *ids.Remote.StatePtr)
	if err != nil {
		return nil, fmt.Errorf("error getting state: %v", err)
	}
	feState := sstore.FeStateFromShellState(currentState)
	shellenv.DumpVarMapFromState(currentState)
	return sstore.InfoMsgUpdate("current connection state sent to log.  festate: %s", dbutil.QuickJson(feState)), nil
}

func RequestThreadsCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	screenId := pk.Kwargs["screenid"]
	if screenId == "" {
		ids, err := resolveUiIds(ctx, pk, R_Screen)
		if err != nil {
			return nil, err
		}
		screenId = ids.ScreenId
	}

	// Fetch threads list for the screen
	threads, err := sstore.ListThreads(ctx, screenId)
	if err != nil {
		return nil, fmt.Errorf("error fetching threads: %v", err)
	}

	// Convert to the format expected by frontend
	items := make([]map[string]string, 0, len(threads))
	for _, t := range threads {
		items = append(items, map[string]string{"threadid": t.ThreadId, "name": t.Name})
	}

	// Send update to frontend
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.ThreadsUpdateType{ScreenId: screenId, Items: items})
	return update, nil
}

var confirmKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// confirm flags must be all lowercase and only contain letters, numbers, and underscores (and start with letter)
func validateOpenAIAPIToken(key string) error {
	if len(key) > MaxOpenAIAPITokenLen {
		return fmt.Errorf("invalid openai token, too long")
	}
	for idx, ch := range key {
		if !unicode.IsPrint(ch) {
			return fmt.Errorf("invalid openai token, char at idx:%d is invalid %q", idx, string(ch))
		}
	}
	return nil
}

func validateOpenAIModel(model string) error {
	if len(model) == 0 {
		return nil
	}
	if len(model) > MaxOpenAIModelLen {
		return fmt.Errorf("invalid openai model, too long")
	}
	for idx, ch := range model {
		if !unicode.IsPrint(ch) {
			return fmt.Errorf("invalid openai model, char at idx:%d is invalid %q", idx, string(ch))
		}
	}
	return nil
}

const MaxFontFamilyLen = 50

var fontfamilyRe = regexp.MustCompile(`^[a-zA-Z0-9_ -]+$`)

func validateFontFamily(fontFamily string) error {
	if len(fontFamily) == 0 {
		return nil
	}
	if len(fontFamily) > MaxFontFamilyLen {
		return fmt.Errorf("invalid font family, too long")
	}
	m := fontfamilyRe.MatchString(fontFamily)
	if !m {
		return fmt.Errorf("invalid font family, must match %q", fontfamilyRe.String())
	}
	return nil
}

func CheckOptionAlias(kwargs map[string]string, aliases ...string) (string, bool) {
	for _, alias := range aliases {
		if val, found := kwargs[alias]; found {
			return val, found
		}
	}
	return "", false
}

func validateSudoPwStore(config string) error {
	if utilfn.ContainsStr([]string{"on", "off", "notimeout"}, config) {
		return nil
	}
	return fmt.Errorf("%s is not a config option", config)
}

func runReleaseCheck(ctx context.Context, force bool) error {
	rslt, err := releasechecker.CheckNewRelease(ctx, force)

	if err != nil {
		return fmt.Errorf("error checking for new release: %v", err)
	}

	if rslt == releasechecker.Failure {
		return fmt.Errorf("error checking for new release, see log for details")
	}

	return nil
}

func setNoReleaseCheck(ctx context.Context, clientData *sstore.ClientData, noReleaseCheckValue bool) error {
	clientOpts := clientData.ClientOpts
	clientOpts.NoReleaseCheck = noReleaseCheckValue
	err := sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("error trying to update client releaseCheck setting: %v", err)
	}
	log.Printf("client no-release-check setting updated to %v\n", noReleaseCheckValue)
	return nil
}

func setAutocompleteEnabled(ctx context.Context, clientData *sstore.ClientData, autocompleteEnabledValue bool) error {
	clientOpts := clientData.ClientOpts
	clientOpts.AutocompleteEnabled = autocompleteEnabledValue
	err := sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("error trying to update client autocomplete setting: %v", err)
	}
	log.Printf("client autocomplete setting updated to %v\n", autocompleteEnabledValue)
	return nil
}

func formatTermOpts(termOpts sstore.TermOpts) string {
	if termOpts.Cols == 0 {
		return "???"
	}
	rtnStr := fmt.Sprintf("%dx%d", termOpts.Rows, termOpts.Cols)
	if termOpts.FlexRows {
		rtnStr += " flexrows"
	}
	if termOpts.MaxPtySize > 0 {
		rtnStr += " maxbuf=" + scbase.NumFormatB2(termOpts.MaxPtySize)
	}
	return rtnStr
}

type ColMeta struct {
	Title   string
	MinCols int
	MaxCols int
}

func toInterfaceArr(sarr []string) []interface{} {
	rtn := make([]interface{}, len(sarr))
	for idx, s := range sarr {
		rtn[idx] = s
	}
	return rtn
}

func isValidInScope(scopeName string, varName string) bool {
	for _, varScope := range SetVarScopes {
		if varScope.ScopeName == scopeName {
			return utilfn.ContainsStr(varScope.VarNames, varName)
		}
	}
	return false
}

// returns (is-valid, scope, name)
// TODO write a full resolver to allow for indexed arguments.  e.g. session[1].screen[1].screen.pterm="25x80"
func resolveSetArg(argName string) (bool, string, string) {
	dotIdx := strings.Index(argName, ".")
	if dotIdx == -1 {
		argName = SetVarNameMap[argName]
		dotIdx = strings.Index(argName, ".")
	}
	if argName == "" {
		return false, "", ""
	}
	scopeName := argName[0:dotIdx]
	varName := argName[dotIdx+1:]
	if !isValidInScope(scopeName, varName) {
		return false, "", ""
	}
	return true, scopeName, varName
}
