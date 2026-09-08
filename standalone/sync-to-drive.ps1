# sync-to-drive.ps1 - mirror the local build workspace into the Drive repo.
#
# Why this exists: npm install cannot complete on the Google Drive volume
# (EBADF mid-write, and the volume refuses directory junctions), so the build
# workspace lives on local NTFS at C:\dev\blitzspirit-standalone. The Drive copy
# under blitzspirit\standalone\ is the committed source of truth and receives
# every source file - just never node_modules, dist, .astro or .vercel.
#
# Run from anywhere:  powershell -File C:\dev\blitzspirit-standalone\sync-to-drive.ps1

$local  = 'C:\dev\blitzspirit-standalone'
$drive  = 'G:\My Drive\CLAUDE\Ai-projects-BRIAN\BlitzSpirit\blitzspirit\standalone'
$skip   = @('node_modules', 'dist', '.astro', '.vercel')

robocopy $local $drive /MIR /XD $skip /NFL /NDL /NJH /NP

# robocopy exit codes below 8 are success (0 = no change, 1 = files copied...).
if ($LASTEXITCODE -lt 8) {
  Write-Output "synced -> $drive"
  exit 0
} else {
  Write-Output "robocopy failed with code $LASTEXITCODE"
  exit $LASTEXITCODE
}
