// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmdrunner

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strconv"

	"github.com/abhishek944/waveterm/waveshell/pkg/utilfn"
	"github.com/abhishek944/waveterm/wavesrv/pkg/remote/openai"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbase"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scbus"
	"github.com/abhishek944/waveterm/wavesrv/pkg/scpacket"
	"github.com/abhishek944/waveterm/wavesrv/pkg/sstore"
)

func validateInputPosition(config string) error {
	if utilfn.ContainsStr([]string{"top", "bottom"}, config) {
		return nil
	}
	return fmt.Errorf("%s is not a config option", config)
}

func ClientCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	return nil, fmt.Errorf("/client requires a subcommand: %s", formatStrs([]string{"show", "set", "notifyupdatewriter", "accepttos", "setconfirmflag", "setmainsidebar", "setrightsidebar", "setglobalshortcut"}, "or", false))
}

func ClientShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	dbVersion, err := sstore.GetDBVersion(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve db version: %v\n", err)
	}
	clientVersion := "-"
	if pk.UIContext != nil && pk.UIContext.Build != "" {
		clientVersion = pk.UIContext.Build
	}
	aiModel := clientData.OpenAIOpts.Model
	if aiModel == "" {
		aiModel = "(default) " + openai.DefaultModel
	}
	aiMaxTokens := fmt.Sprintf("%d", clientData.OpenAIOpts.MaxTokens)
	if clientData.OpenAIOpts.MaxTokens == 0 {
		aiMaxTokens = fmt.Sprintf("(default) %d", openai.DefaultMaxTokens)
	}
	aiMaxChoices := fmt.Sprintf("%d", clientData.OpenAIOpts.MaxChoices)
	if clientData.OpenAIOpts.MaxChoices == 0 {
		aiMaxChoices = "(not set)"
	}
	aiBaseUrl := clientData.OpenAIOpts.BaseURL
	if aiBaseUrl == "" {
		aiBaseUrl = "(openai default)"
	}
	aiTimeout := fmt.Sprintf("(default) %d", (OpenAIPacketTimeout / 1000))
	if clientData.OpenAIOpts.Timeout != 0 {
		aiTimeout = strconv.FormatFloat((float64(clientData.OpenAIOpts.Timeout) / 1000.0), 'f', -1, 64)
	}
	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "userid", clientData.UserId))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "clientid", clientData.ClientId))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "telemetry", boolToStr(clientData.ClientOpts.NoTelemetry, "off", "on")))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "release-check", boolToStr(clientData.ClientOpts.NoReleaseCheck, "off", "on")))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "db-version", dbVersion))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "client-version", clientVersion))
	buf.WriteString(fmt.Sprintf("  %-15s %s %s\n", "server-version", scbase.WaveVersion, scbase.BuildTime))
	buf.WriteString(fmt.Sprintf("  %-15s %s (%s)\n", "arch", scbase.ClientArch(), scbase.UnameKernelRelease()))
	buf.WriteString(fmt.Sprintf("  %-15s %d\n", "termfontsize", clientData.FeOpts.TermFontSize))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "termfontfamily", clientData.FeOpts.TermFontFamily))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "termfontfamily", clientData.FeOpts.Theme))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "aiapitoken", clientData.OpenAIOpts.APIToken))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "aimodel", aiModel))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "aimaxtokens", aiMaxTokens))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "aimaxchoices", aiMaxChoices))
	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "aibaseurl", aiBaseUrl))
	buf.WriteString(fmt.Sprintf("  %-15s %ss\n", "aitimeout", aiTimeout))
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(sstore.InfoMsgType{
		InfoTitle: fmt.Sprintf("client info"),
		InfoLines: splitLinesForInfo(buf.String()),
	})

	return update, nil
}

func ClientSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	log.Printf("[ClientSetCommand] Starting with kwargs: %v", pk.Kwargs)
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	log.Printf("[ClientSetCommand] Current AIOpts: %+v", clientData.AIOpts)
	var varsUpdated []string
	if fontSizeStr, found := pk.Kwargs["termfontsize"]; found {
		newFontSize, err := resolveNonNegInt(fontSizeStr, 0)
		if err != nil {
			return nil, fmt.Errorf("invalid termfontsize, must be a number between 8-15: %v", err)
		}
		if newFontSize < TermFontSizeMin || newFontSize > TermFontSizeMax {
			return nil, fmt.Errorf("invalid termfontsize, must be a number between %d-%d", TermFontSizeMin, TermFontSizeMax)
		}
		feOpts := clientData.FeOpts
		feOpts.TermFontSize = newFontSize
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "termfontsize")
	}
	if fontFamilyStr, found := pk.Kwargs["termfontfamily"]; found {
		newFontFamily := fontFamilyStr
		err = validateFontFamily(newFontFamily)
		if err != nil {
			return nil, err
		}
		feOpts := clientData.FeOpts
		feOpts.TermFontFamily = newFontFamily
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "termfontfamily")
	}
	if themeSourceStr, found := pk.Kwargs["theme"]; found {
		newThemeSource := themeSourceStr
		found := false
		for _, theme := range ThemeSources {
			if newThemeSource == theme {
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("invalid theme source")
		}
		feOpts := clientData.FeOpts
		feOpts.Theme = newThemeSource
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "theme")
	}
	if termthemeStr, found := pk.Kwargs["termtheme"]; found {
		feOpts := clientData.FeOpts
		if feOpts.TermThemeSettings == nil {
			feOpts.TermThemeSettings = make(map[string]string)
		}
		if termthemeStr == "" {
			delete(feOpts.TermThemeSettings, "root")
		} else {
			feOpts.TermThemeSettings["root"] = termthemeStr
		}
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "termtheme")
	}
	if inputPositionStr, found := pk.Kwargs["inputposition"]; found {
		err := validateInputPosition(inputPositionStr)
		if err != nil {
			return nil, err
		}
		clientOpts := clientData.ClientOpts
		clientOpts.InputPosition = inputPositionStr
		err = sstore.SetClientOpts(ctx, clientOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client inputposition: %v", err)
		}
		varsUpdated = append(varsUpdated, "inputposition")
	}
	if apiToken, found := CheckOptionAlias(pk.Kwargs, "openaiapitoken", "aiapitoken"); found {
		err = validateOpenAIAPIToken(apiToken)
		if err != nil {
			return nil, err
		}
		varsUpdated = append(varsUpdated, "openaiapitoken")
		aiOpts := clientData.OpenAIOpts
		if aiOpts == nil {
			aiOpts = &sstore.OpenAIOptsType{}
			clientData.OpenAIOpts = aiOpts
		}
		aiOpts.APIToken = apiToken
		err = sstore.UpdateClientOpenAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai api token: %v", err)
		}
	}
	if aiModel, found := CheckOptionAlias(pk.Kwargs, "openaimodel", "aimodel"); found {
		err = validateOpenAIModel(aiModel)
		if err != nil {
			return nil, err
		}
		varsUpdated = append(varsUpdated, "openaimodel")
		aiOpts := clientData.OpenAIOpts
		if aiOpts == nil {
			aiOpts = &sstore.OpenAIOptsType{}
			clientData.OpenAIOpts = aiOpts
		}
		aiOpts.Model = aiModel
		err = sstore.UpdateClientOpenAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai model: %v", err)
		}
	}
	if maxTokensStr, found := CheckOptionAlias(pk.Kwargs, "openaimaxtokens", "aimaxtokens"); found {
		maxTokens, err := strconv.Atoi(maxTokensStr)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai maxtokens, invalid number: %v", err)
		}
		if maxTokens < 0 || maxTokens > 1000000 {
			return nil, fmt.Errorf("error updating client ai maxtokens, out of range: %d", maxTokens)
		}
		varsUpdated = append(varsUpdated, "openaimaxtokens")
		aiOpts := clientData.OpenAIOpts
		if aiOpts == nil {
			aiOpts = &sstore.OpenAIOptsType{}
			clientData.OpenAIOpts = aiOpts
		}
		aiOpts.MaxTokens = maxTokens
		err = sstore.UpdateClientOpenAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai maxtokens: %v", err)
		}
	}
	if maxChoicesStr, found := CheckOptionAlias(pk.Kwargs, "openaimaxchoices", "aimaxchoices"); found {
		maxChoices, err := strconv.Atoi(maxChoicesStr)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai maxchoices, invalid number: %v", err)
		}
		if maxChoices < 0 || maxChoices > 10 {
			return nil, fmt.Errorf("error updating client ai maxchoices, out of range: %d", maxChoices)
		}
		varsUpdated = append(varsUpdated, "openaimaxchoices")
		aiOpts := clientData.OpenAIOpts
		if aiOpts == nil {
			aiOpts = &sstore.OpenAIOptsType{}
			clientData.OpenAIOpts = aiOpts
		}
		aiOpts.MaxChoices = maxChoices
		err = sstore.UpdateClientOpenAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai maxchoices: %v", err)
		}
	}
	if aiBaseURL, found := CheckOptionAlias(pk.Kwargs, "openaibaseurl", "aibaseurl"); found {
		aiOpts := clientData.OpenAIOpts
		if aiOpts == nil {
			aiOpts = &sstore.OpenAIOptsType{}
			clientData.OpenAIOpts = aiOpts
		}
		aiOpts.BaseURL = aiBaseURL
		varsUpdated = append(varsUpdated, "openaibaseurl")
		err = sstore.UpdateClientOpenAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai base url: %v", err)
		}
	}
	if aiTimeoutStr, found := CheckOptionAlias(pk.Kwargs, "openaitimeout", "aitimeout"); found {
		aiTimeout, err := strconv.ParseFloat(aiTimeoutStr, 64)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai timeout, invalid number: %v", err)
		}
		aiOpts := clientData.OpenAIOpts
		if aiOpts == nil {
			aiOpts = &sstore.OpenAIOptsType{}
			clientData.OpenAIOpts = aiOpts
		}
		aiOpts.Timeout = int(aiTimeout * 1000)
		varsUpdated = append(varsUpdated, "openaitimeout")
		err = sstore.UpdateClientOpenAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai timeout: %v", err)
		}
	}
	if webglStr, found := pk.Kwargs["webgl"]; found {
		webglVal := resolveBool(webglStr, false)
		clientOpts := clientData.ClientOpts
		clientOpts.WebGL = webglVal
		err = sstore.SetClientOpts(ctx, clientOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client webgl: %v", err)
		}
		varsUpdated = append(varsUpdated, "webgl")
	}
	// Handle new AI provider options
	aiOptsUpdated := false
	aiOpts := clientData.AIOpts
	if aiOpts == nil {
		aiOpts = &sstore.AIOptsType{}
	} else {
		// Create a deep copy to preserve existing data
		aiOptsCopy := *aiOpts
		aiOpts = &aiOptsCopy
		// Deep copy nested structs if they exist
		if aiOpts.Gemini != nil {
			geminiCopy := *aiOpts.Gemini
			aiOpts.Gemini = &geminiCopy
		}
		if aiOpts.OpenAI != nil {
			openaiCopy := *aiOpts.OpenAI
			aiOpts.OpenAI = &openaiCopy
		}
		if aiOpts.Azure != nil {
			azureCopy := *aiOpts.Azure
			aiOpts.Azure = &azureCopy
		}
	}
	// Handle default provider
	if defaultProvider, found := pk.Kwargs["defaultprovider"]; found {
		log.Printf("[ClientSetCommand] Received defaultprovider: '%s'", defaultProvider)
		if defaultProvider == "" {
			log.Printf("[ClientSetCommand] Warning: empty default provider received")
		}
		if defaultProvider != "" && defaultProvider != "openai" && defaultProvider != "gemini" && defaultProvider != "azure" {
			return nil, fmt.Errorf("invalid default provider '%s', must be 'openai', 'gemini', or 'azure'", defaultProvider)
		}
		if defaultProvider != "" {
			aiOpts.Default = defaultProvider
			aiOptsUpdated = true
			varsUpdated = append(varsUpdated, "defaultprovider")
		}
	}
	// Handle Gemini options
	if geminiModel, found := pk.Kwargs["geminimodel"]; found {
		if aiOpts.Gemini == nil {
			aiOpts.Gemini = &sstore.GeminiOptsType{}
		}
		aiOpts.Gemini.Model = geminiModel
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "geminimodel")
	}
	if geminiAPIToken, found := pk.Kwargs["geminiapitoken"]; found {
		// Validate token
		err = validateOpenAIAPIToken(geminiAPIToken) // reuse validation function
		if err != nil {
			return nil, fmt.Errorf("invalid gemini api token: %v", err)
		}
		if aiOpts.Gemini == nil {
			aiOpts.Gemini = &sstore.GeminiOptsType{}
		}
		aiOpts.Gemini.APIToken = geminiAPIToken
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "geminiapitoken")
	}
	if geminiEnabled, found := pk.Kwargs["geminienabled"]; found {
		if aiOpts.Gemini == nil {
			aiOpts.Gemini = &sstore.GeminiOptsType{}
		}
		aiOpts.Gemini.Enabled = (geminiEnabled == "true")
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "geminienabled")
	}
	// Handle new OpenAI options through AIOpts
	if openaiModel, found := pk.Kwargs["openaimodel"]; found {
		if aiOpts.OpenAI == nil {
			aiOpts.OpenAI = &sstore.OpenAIOptsType{}
		}
		aiOpts.OpenAI.Model = openaiModel
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "openaimodel")
	}
	if openaiAPIToken, found := pk.Kwargs["openaiapitoken"]; found {
		if aiOpts.OpenAI == nil {
			aiOpts.OpenAI = &sstore.OpenAIOptsType{}
		}
		aiOpts.OpenAI.APIToken = openaiAPIToken
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "openaiapitoken")
	}
	if openaiEnabled, found := pk.Kwargs["openaienabled"]; found {
		if aiOpts.OpenAI == nil {
			aiOpts.OpenAI = &sstore.OpenAIOptsType{}
		}
		aiOpts.OpenAI.Enabled = (openaiEnabled == "true")
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "openaienabled")
	}
	// Handle Azure options
	if azureBaseURL, found := pk.Kwargs["azurebaseurl"]; found {
		if aiOpts.Azure == nil {
			aiOpts.Azure = &sstore.AzureOpenAIOptsType{}
		}
		aiOpts.Azure.BaseURL = azureBaseURL
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "azurebaseurl")
	}
	if azureDeploymentName, found := pk.Kwargs["azuredeploymentname"]; found {
		if aiOpts.Azure == nil {
			aiOpts.Azure = &sstore.AzureOpenAIOptsType{}
		}
		aiOpts.Azure.DeploymentName = azureDeploymentName
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "azuredeploymentname")
	}
	if azureAPIToken, found := pk.Kwargs["azureapitoken"]; found {
		// Validate token
		err = validateOpenAIAPIToken(azureAPIToken)
		if err != nil {
			return nil, fmt.Errorf("invalid azure api token: %v", err)
		}
		if aiOpts.Azure == nil {
			aiOpts.Azure = &sstore.AzureOpenAIOptsType{}
		}
		aiOpts.Azure.APIToken = azureAPIToken
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "azureapitoken")
	}
	if azureEnabled, found := pk.Kwargs["azureenabled"]; found {
		if aiOpts.Azure == nil {
			aiOpts.Azure = &sstore.AzureOpenAIOptsType{}
		}
		aiOpts.Azure.Enabled = (azureEnabled == "true")
		aiOptsUpdated = true
		varsUpdated = append(varsUpdated, "azureenabled")
	}
	// Update AIOpts if any changes were made
	if aiOptsUpdated {
		log.Printf("[ClientSetCommand] Updating AIOpts: %+v", aiOpts)
		if aiOpts.Gemini != nil {
			log.Printf("[ClientSetCommand] Gemini config: APIToken=%s", aiOpts.Gemini.APIToken)
		}
		err = sstore.UpdateClientAIOpts(ctx, *aiOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client ai options: %v", err)
		}
		log.Printf("[ClientSetCommand] AIOpts updated successfully")
	}
	if sudoPwStoreStr, found := pk.Kwargs["sudopwstore"]; found {
		err := validateSudoPwStore(sudoPwStoreStr)
		if err != nil {
			return nil, fmt.Errorf("invalid sudo pw store, must be \"on\", \"off\", \"notimeout\": %v", err)
		}
		feOpts := clientData.FeOpts
		feOpts.SudoPwStore = sudoPwStoreStr
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "sudopwstore")
	}
	if sudoPwTimeoutStr, found := pk.Kwargs["sudopwtimeout"]; found {
		sudoPwTimeout, err := strconv.Atoi(sudoPwTimeoutStr)
		if err != nil {
			return nil, fmt.Errorf("invalid sudo pw timeout, not a number: %v", err)
		}
		if sudoPwTimeout < 1 {
			return nil, fmt.Errorf("invalid sudo pw timeout, must be at least 1")
		}
		feOpts := clientData.FeOpts
		feOpts.SudoPwTimeoutMs = sudoPwTimeout * 60 * 1000
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "sudopwtimeout")
	}
	if sudoPwClearOnSleepStr, found := pk.Kwargs["sudopwclearonsleep"]; found {
		var feOpts = clientData.FeOpts
		feOpts.NoSudoPwClearOnSleep = !resolveBool(sudoPwClearOnSleepStr, true)
		err = sstore.UpdateClientFeOpts(ctx, feOpts)
		if err != nil {
			return nil, fmt.Errorf("error updating client feopts: %v", err)
		}
		varsUpdated = append(varsUpdated, "sudopwclearonsleep")
	}
	if len(varsUpdated) == 0 {
		return nil, fmt.Errorf("/client:set requires a value to set: %s", formatStrs([]string{"termfontsize", "termfontfamily", "inputposition", "openaiapitoken", "openaimodel", "openaibaseurl", "openaimaxtokens", "openaimaxchoices", "openaitimeout", "webgl", "defaultprovider", "geminimodel", "geminiapitoken", "azurebaseurl", "azuredeploymentname", "azureapitoken"}, "or", false))
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	log.Printf("[ClientSetCommand] Final clientData AIOpts: %+v", clientData.AIOpts)
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("client updated %s", formatStrs(varsUpdated, "and", false)),
		TimeoutMs: 2000,
	})
	return update, nil
}

func ClientNotifyUpdateWriterCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	log.Printf("sending notifyupdate to %s\n", clientData.UserId)
	update := scbus.MakeUpdatePacket()
	if clientData.UserId == "" {
		update.AddUpdate(sstore.InfoMsgType{
			InfoMsg:   "Client NotifyUpdateWriter Error: userid is not set",
			TimeoutMs: 2000,
		})
		return update, nil
	}
	update.AddUpdate(sstore.InfoMsgType{
		InfoMsg:   fmt.Sprintf("notified user %q of update", clientData.UserId),
		TimeoutMs: 2000,
	})
	return update, nil
}

func ClientAcceptTosCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	clientOpts := clientData.ClientOpts
	clientOpts.AcceptedTos = 1
	err = sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("error updating client data: %v", err)
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	return update, nil
}

func boolToStr(val bool, trueStr string, falseStr string) string {
	if val {
		return trueStr
	}
	return falseStr
}

func ClientConfirmFlagCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	flagName := firstArg(pk)
	if flagName == "" {
		return nil, fmt.Errorf("usage /client:confirmflag [flagname] [0 | 1], no flagname passed")
	}
	valueStr := pk.Args[1]
	if valueStr == "" {
		return nil, fmt.Errorf("usage /client:confirmflag [flagname] [0 | 1], no value passed")
	}
	if valueStr != "0" && valueStr != "1" {
		return nil, fmt.Errorf("usage /client:confirmflag [flagname] [0 | 1], invalid value %q passed", valueStr)
	}
	clientOpts := clientData.ClientOpts
	confirmFlags := clientOpts.ConfirmFlags
	if confirmFlags == nil {
		confirmFlags = make(map[string]bool)
	}
	confirmFlags[flagName] = (valueStr == "1")
	clientOpts.ConfirmFlags = confirmFlags
	err = sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("error updating client data: %v", err)
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	return update, nil
}

func ClientSetMainSidebarCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	width, err := resolveNonNegInt(pk.Kwargs["width"], 0)
	if err != nil {
		return nil, fmt.Errorf("error resolving width: %v", err)
	}
	collapsed := pk.Kwargs["collapsed"] == "1"
	if width < 0 {
		return nil, fmt.Errorf("error setting main sidebar width: %d", width)
	}
	clientOpts := clientData.ClientOpts
	if clientOpts.MainSidebar == nil {
		clientOpts.MainSidebar = &sstore.SidebarValueType{}
	}
	clientOpts.MainSidebar.Width = width
	clientOpts.MainSidebar.Collapsed = collapsed
	err = sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("error updating client opts: %v", err)
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	return update, nil
}

func ClientSetRightSidebarCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	width, err := resolveNonNegInt(pk.Kwargs["width"], 0)
	if err != nil {
		return nil, fmt.Errorf("error resolving width: %v", err)
	}
	collapsed := pk.Kwargs["collapsed"] == "1"
	if width < 0 {
		return nil, fmt.Errorf("error setting right sidebar width: %d", width)
	}
	clientOpts := clientData.ClientOpts
	if clientOpts.RightSidebar == nil {
		clientOpts.RightSidebar = &sstore.SidebarValueType{}
	}
	clientOpts.RightSidebar.Width = width
	clientOpts.RightSidebar.Collapsed = collapsed
	err = sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("error updating client opts: %v", err)
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	return update, nil
}

func ClientSetGlobalShortcut(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
	clientData, err := sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
	}
	newShortcut := firstArg(pk)
	clientOpts := clientData.ClientOpts
	if newShortcut == clientOpts.GlobalShortcut {
		return nil, nil
	}
	if (newShortcut == "" && clientOpts.GlobalShortcutEnabled) || (newShortcut != "" && !clientOpts.GlobalShortcutEnabled) {
		clientOpts.GlobalShortcutEnabled = !clientOpts.GlobalShortcutEnabled
	}
	clientOpts.GlobalShortcut = newShortcut
	err = sstore.SetClientOpts(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("error updating client data: %v", err)
	}
	clientData, err = sstore.EnsureClientData(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
	}
	update := scbus.MakeUpdatePacket()
	update.AddUpdate(*clientData)
	return update, nil
}