# Self-Hosted Fonts

This directory contains self-hosted font files for the Concord Admin Panel.

## License

Both fonts are licensed under the **SIL Open Font License 1.1 (OFL)**:

- **Fredoka One** - See `Fredoka-LICENSE.md`
- **IBM Plex Sans** - See `IBMPlexSans-LICENSE.md`

✅ You may use these fonts in your projects  
✅ You may redistribute with your software  
✅ You may commit to public repositories  
⚠️ Include the license file when redistributing  

---

## Required Fonts

The following font files should be in this directory:

### Fredoka One
- **File:** `FredokaOne-Regular.otf`
- **Download:** https://fonts.google.com/specimen/Fredoka+One

### IBM Plex Sans
- **File:** `IBMPlexSans-Regular.ttf` (400)
- **File:** `IBMPlexSans-Medium.ttf` (500)
- **File:** `IBMPlexSans-SemiBold.ttf` (600)
- **File:** `IBMPlexSans-Bold.ttf` (700)
- **Download:** https://fonts.google.com/specimen/IBM+Plex+Sans

## Quick Download

### Option 1: Manual Download
1. Visit the links above
2. Click "Download family"
3. Extract the .zip file
4. Copy the .ttf files to this directory
5. Rename files to match the names above

### Option 2: Using wget (Linux/Mac)
```bash
cd src/public/fonts

# Fredoka One
wget https://github.com/google/fonts/raw/main/ofl/fredokaone/FredokaOne-Regular.ttf -O Fredoka-One.ttf

# IBM Plex Sans
wget https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Regular.ttf -O IBMPlexSans-Regular.ttf
wget https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Medium.ttf -O IBMPlexSans-Medium.ttf
wget https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-SemiBold.ttf -O IBMPlexSans-SemiBold.ttf
wget https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Bold.ttf -O IBMPlexSans-Bold.ttf
```

### Option 3: Using curl (Windows PowerShell)
```powershell
cd src/public/fonts

# Fredoka One
curl -L https://github.com/google/fonts/raw/main/ofl/fredokaone/FredokaOne-Regular.ttf -o Fredoka-One.ttf

# IBM Plex Sans
curl -L https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Regular.ttf -o IBMPlexSans-Regular.ttf
curl -L https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Medium.ttf -o IBMPlexSans-Medium.ttf
curl -L https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-SemiBold.ttf -o IBMPlexSans-SemiBold.ttf
curl -L https://github.com/google/fonts/raw/main/ofl/ibmplexsans/IBMPlexSans-Bold.ttf -o IBMPlexSans-Bold.ttf
```

## After Downloading

1. Verify all 5 font files are in `src/public/fonts/`
2. Restart your application
3. Check browser dev tools → Network tab to confirm fonts load from `/fonts/...`
4. No more Google Fonts requests!

## Why Self-Host?

- ✅ **Privacy** - No Google tracking
- ✅ **GDPR compliant** - No EU legal issues
- ✅ **Security** - No external dependencies
- ✅ **Offline** - Works without internet
- ✅ **Performance** - No external DNS lookup

---

**Note:** If fonts don't load immediately, clear your browser cache or do a hard refresh (Ctrl+Shift+R / Cmd+Shift+R).
