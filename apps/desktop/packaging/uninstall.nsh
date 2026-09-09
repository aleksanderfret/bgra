; Stage 3H — same Electron uninstall UI, then NSIS removes the install dir.
; Exit code 0 = player finished the UI (even if some optional deletes failed).
; Exit code non-zero = cancelled / closed without confirming → Abort.

!macro customUnInstall
  System::Call 'Kernel32::SetEnvironmentVariable(t "BGA_UNINSTALL_VIA_NSIS", t "1")i.r0'
  ; Full tree under %TEMP% so NSIS can delete $INSTDIR after the UI exits.
  RMDir /r "$TEMP\bga-uninstall-ui"
  CreateDirectory "$TEMP\bga-uninstall-ui"
  nsExec::ExecToLog 'cmd /c xcopy /E /I /Y /Q "$INSTDIR\*" "$TEMP\bga-uninstall-ui\"'
  ClearErrors
  ExecWait '"$TEMP\bga-uninstall-ui\${APP_EXECUTABLE_FILENAME}" --bga-uninstall' $1
  RMDir /r "$TEMP\bga-uninstall-ui"
  IfErrors abort_uninstall
  IntCmp $1 0 done_uninstall
  abort_uninstall:
    Abort
  done_uninstall:
!macroend
