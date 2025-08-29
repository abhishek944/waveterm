package cmdrunner

// func TelemetryCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
// 	return nil, fmt.Errorf("/telemetry requires a subcommand: %s", formatStrs([]string{"show", "on", "off", "send"}, "or", false))
// }

// func setNoTelemetry(ctx context.Context, clientData *sstore.ClientData, noTelemetryVal bool) error {
// 	clientOpts := clientData.ClientOpts
// 	clientOpts.NoTelemetry = noTelemetryVal
// 	err := sstore.SetClientOpts(ctx, clientOpts)
// 	if err != nil {
// 		return fmt.Errorf("error trying to update client telemetry: %v", err)
// 	}
// 	log.Printf("client no-telemetry setting updated to %v\n", noTelemetryVal)
// 	go func() {
// 		cloudCtx, cancelFn := context.WithTimeout(context.Background(), 10*time.Second)
// 		defer cancelFn()
// 		err := pcloud.SendNoTelemetryUpdate(cloudCtx, clientOpts.NoTelemetry)
// 		if err != nil {
// 			log.Printf("[error] sending no-telemetry update: %v\n", err)
// 			log.Printf("note that telemetry update has still taken effect locally, and will be respected by the client\n")
// 		}
// 	}()
// 	return nil
// }

// func TelemetryOnCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
// 	clientData, err := sstore.EnsureClientData(ctx)
// 	if err != nil {
// 		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
// 	}
// 	if !clientData.ClientOpts.NoTelemetry {
// 		return sstore.InfoMsgUpdate("telemetry is already on"), nil
// 	}
// 	err = setNoTelemetry(ctx, clientData, false)
// 	if err != nil {
// 		return nil, err
// 	}
// 	go func() {
// 		cloudCtx, cancelFn := context.WithTimeout(context.Background(), 10*time.Second)
// 		defer cancelFn()
// 		err := pcloud.SendTelemetry(cloudCtx, false)
// 		if err != nil {
// 			// ignore error, but log
// 			log.Printf("[error] sending telemetry update (in /telemetry:on): %v\n", err)
// 		}
// 	}()
// 	clientData, err = sstore.EnsureClientData(ctx)
// 	if err != nil {
// 		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
// 	}
// 	update := sstore.InfoMsgUpdate("telemetry is now on")
// 	update.AddUpdate(*clientData)
// 	return update, nil
// }

// func TelemetryOffCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
// 	clientData, err := sstore.EnsureClientData(ctx)
// 	if err != nil {
// 		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
// 	}
// 	if clientData.ClientOpts.NoTelemetry {
// 		return sstore.InfoMsgUpdate("telemetry is already off"), nil
// 	}
// 	err = setNoTelemetry(ctx, clientData, true)
// 	if err != nil {
// 		return nil, err
// 	}
// 	clientData, err = sstore.EnsureClientData(ctx)
// 	if err != nil {
// 		return nil, fmt.Errorf("cannot retrieve updated client data: %v", err)
// 	}
// 	update := sstore.InfoMsgUpdate("telemetry is now off")
// 	update.AddUpdate(*clientData)
// 	return update, nil
// }

// func TelemetryShowCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
// 	clientData, err := sstore.EnsureClientData(ctx)
// 	if err != nil {
// 		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
// 	}
// 	var buf bytes.Buffer
// 	buf.WriteString(fmt.Sprintf("  %-15s %s\n", "telemetry", boolToStr(clientData.ClientOpts.NoTelemetry, "off", "on")))
// 	update := scbus.MakeUpdatePacket()
// 	update.AddUpdate(sstore.InfoMsgType{
// 		InfoTitle: fmt.Sprintf("telemetry info"),
// 		InfoLines: splitLinesForInfo(buf.String()),
// 	})
// 	return update, nil
// }

// func TelemetrySendCommand(ctx context.Context, pk *scpacket.FeCommandPacketType) (scbus.UpdatePacket, error) {
// 	clientData, err := sstore.EnsureClientData(ctx)
// 	if err != nil {
// 		return nil, fmt.Errorf("cannot retrieve client data: %v", err)
// 	}
// 	force := resolveBool(pk.Kwargs["force"], false)
// 	if clientData.ClientOpts.NoTelemetry && !force {
// 		return nil, fmt.Errorf("cannot send telemetry, telemetry is off.  pass force=1 to force the send, or turn on telemetry with /telemetry:on")
// 	}
// 	err = pcloud.SendTelemetry(ctx, force)
// 	if err != nil {
// 		return nil, fmt.Errorf("failed to send telemetry: %v", err)
// 	}
// 	return sstore.InfoMsgUpdate("telemetry sent"), nil
// }
