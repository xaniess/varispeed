use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::{hash_map::DefaultHasher, HashMap}, fs, hash::{Hash, Hasher}, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}, time::{SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

static NEXT_TMP: AtomicU64 = AtomicU64::new(0);
const ALLOWED: &[&str] = &["wav", "mp3", "flac", "m4a", "aac", "ogg", "opus", "aif", "aiff", "wma"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioInfo {
    path: String,
    name: String,
    stem: String,
    duration: f64,
    sample_rate: u32,
    tags: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewInfo {
    original_path: String,
    b_path: String,
    original_duration: f64,
    b_duration: f64,
    source_file_duration: f64,
    reference_file_duration: Option<f64>,
    original_peaks: Vec<f32>,
    b_peaks: Vec<f32>,
    original_rms: Vec<f32>,
    b_rms: Vec<f32>,
    effective_cents: Option<f64>,
    reference_signal_a: Option<Vec<f32>>,
    reference_signal_b: Option<Vec<f32>>,
    mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    source: String,
    cents: f64,
    format: String,
    folder: String,
    template: String,
    override_stem: Option<String>,
}

fn check_audio(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.is_file() { return Err(format!("File not found: {path}")); }
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
    if !ALLOWED.contains(&ext.as_str()) { return Err(format!("Unsupported format: .{ext}")); }
    Ok(())
}

fn validate_pitch(cents: f64) -> Result<f64, String> {
    if !cents.is_finite() || !(-1200.0..=1200.0).contains(&cents) { return Err("Pitch must be between -1200 and +1200 cents.".into()); }
    Ok(2.0f64.powf(cents / 1200.0))
}

async fn tool(app: &AppHandle, name: &str, args: Vec<String>) -> Result<Vec<u8>, String> {
    // Only the Rust backend can execute these bundled tools. No generic shell access is exposed to the UI.
    let cmd = app.shell().sidecar(name).map_err(|e| format!("Cannot find bundled {name}: {e}"))?;
    let output = cmd.args(args).output().await.map_err(|e| format!("{name} did not start: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{name}: {}", stderr.chars().rev().take(1400).collect::<String>().chars().rev().collect::<String>()));
    }
    Ok(output.stdout)
}

async fn probe(app: &AppHandle, path: &str) -> Result<AudioInfo, String> {
    check_audio(path)?;
    let bytes = tool(app, "ffprobe", vec![
        "-v".into(), "error".into(), "-show_entries".into(),
        "format=duration:format_tags:stream=codec_type,sample_rate,duration:stream_tags".into(),
        "-of".into(), "json".into(), path.into()
    ]).await?;
    let result: Value = serde_json::from_slice(&bytes).map_err(|e| format!("Invalid FFprobe output: {e}"))?;
    let streams = result["streams"].as_array().ok_or("No audio streams detected")?;
    let audio = streams.iter().find(|x| x["codec_type"].as_str() == Some("audio")).ok_or("File has no audio track")?;
    let sample_rate: u32 = audio["sample_rate"].as_str().unwrap_or("0").parse().unwrap_or(0);
    if sample_rate < 8000 || sample_rate > 384000 { return Err("Unsupported sample rate.".into()); }
    let duration: f64 = result["format"]["duration"].as_str().or_else(|| audio["duration"].as_str()).unwrap_or("0").parse().unwrap_or(0.0);
    if !duration.is_finite() || duration <= 0.0 { return Err("Cannot read audio duration.".into()); }
    let mut tags = HashMap::new();
    for source in [&result["format"]["tags"], &audio["tags"]] {
        if let Some(obj) = source.as_object() {
            for (key, value) in obj {
                if let Some(s) = value.as_str() { tags.insert(key.to_lowercase(), s.to_string()); }
            }
        }
    }
    let name = Path::new(path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "unknown".into());
    let stem = Path::new(path).file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Untitled".into());
    Ok(AudioInfo { path: path.to_string(), name, stem, duration, sample_rate, tags })
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("wave-previews");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn cache_key(source: &str, cents: f64, reference: Option<&str>) -> String {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    cents.to_bits().hash(&mut hasher);
    reference.unwrap_or("").hash(&mut hasher);
    for item in [Some(source), reference].into_iter().flatten() {
        if let Ok(meta) = fs::metadata(item) {
            meta.len().hash(&mut hasher);
            if let Ok(modified) = meta.modified() { if let Ok(delta) = modified.duration_since(UNIX_EPOCH) { delta.as_nanos().hash(&mut hasher); } }
        }
    }
    format!("{:016x}", hasher.finish())
}

async fn decode_wav(app: &AppHandle, source: &str, target: &Path, cents: Option<(f64, u32)>) -> Result<(), String> {
    if target.exists() { return Ok(()); }
    let mut args = vec!["-hide_banner".into(), "-loglevel".into(), "error".into(), "-nostdin".into(), "-y".into(), "-i".into(), source.into(), "-map".into(), "0:a:0".into(), "-vn".into()];
    if let Some((amount, rate)) = cents {
        let ratio = validate_pitch(amount)?;
        let adjusted = (rate as f64 * ratio).round() as u32;
        args.extend(["-af".into(), format!("asetrate={adjusted},aresample={rate}:filter_size=64")]);
    }
    args.extend(["-ac".into(), "2".into(), "-ar".into(), "44100".into(), "-c:a".into(), "pcm_s16le".into(), target.to_string_lossy().into_owned()]);
    if let Err(error) = tool(app, "ffmpeg", args).await { let _ = fs::remove_file(target); return Err(error); }
    Ok(())
}

// High-resolution waveform: transient peaks and actual energy, rather than
// only peak maxima. Loud mastered recordings can look solid when the maximum
// sample of every bin is near 0 dBFS. RMS retains useful shape and dynamics.
struct WaveformEnvelope { peaks: Vec<f32>, rms: Vec<f32> }

async fn waveform_envelope(app: &AppHandle, file: &Path) -> Result<WaveformEnvelope, String> {
    let raw = tool(app, "ffmpeg", vec![
        "-v".into(), "error".into(), "-nostdin".into(), "-i".into(), file.to_string_lossy().into_owned(),
        "-map".into(), "0:a:0".into(), "-ac".into(), "1".into(), "-ar".into(), "2000".into(),
        "-f".into(), "s16le".into(), "pipe:1".into()
    ]).await?;
    let samples = raw.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect::<Vec<_>>();
    let size = samples.len().div_ceil(1800).max(1);
    let mut peaks = Vec::with_capacity(1800);
    let mut rms = Vec::with_capacity(1800);
    for chunk in samples.chunks(size) {
        let mut max_sample: i32 = 0;
        let mut power: f64 = 0.0;
        for &sample in chunk {
            let amplitude = i32::from(sample).abs();
            max_sample = max_sample.max(amplitude);
            power += f64::from(sample) * f64::from(sample);
        }
        peaks.push((max_sample as f32 / 32768.0).min(1.0));
        rms.push(((power / chunk.len() as f64).sqrt() / 32768.0).min(1.0) as f32);
    }
    Ok(WaveformEnvelope { peaks, rms })
}

// Time-aligned log-RMS envelopes, at 100 samples per second, for reference
// comparison. Higher resolution than the display waveform and resistant to
// MP3 frame padding and long export tails.
async fn timing_envelope(app: &AppHandle, file: &Path) -> Result<Vec<f32>, String> {
    let raw = tool(app, "ffmpeg", vec![
        "-v".into(), "error".into(), "-nostdin".into(), "-i".into(), file.to_string_lossy().into_owned(),
        "-map".into(), "0:a:0".into(), "-ac".into(), "1".into(), "-ar".into(), "2000".into(),
        "-f".into(), "s16le".into(), "pipe:1".into(),
    ]).await?;
    let frames: Vec<f32> = raw.chunks_exact(40).map(|frame| {
        let mut total: f64 = 0.0;
        for sample in frame.chunks_exact(2) {
            let value = i16::from_le_bytes([sample[0], sample[1]]) as f64;
            total += value * value;
        }
        ((1.0 + (total / 20.0).sqrt() / 100.0).ln()) as f32
    }).collect();
    if frames.len() < 600 { return Ok(Vec::new()); }
    let mut smoothed = frames.clone();
    for i in 1..frames.len() - 1 {
        smoothed[i] = frames[i - 1] * .2 + frames[i] * .6 + frames[i + 1] * .2;
    }
    Ok(smoothed)
}

#[tauri::command]
async fn choose_audio_files() -> Result<Vec<String>, String> {
    let paths = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new().add_filter("Audio tracks", ALLOWED).pick_files()
    }).await.map_err(|e| e.to_string())?;
    Ok(paths.unwrap_or_default().into_iter().map(|p| p.to_string_lossy().into_owned()).collect())
}

#[tauri::command]
async fn choose_export_folder() -> Result<Option<String>, String> {
    let selection = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder()).await.map_err(|e| e.to_string())?;
    Ok(selection.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn inspect_audio(app: AppHandle, source: String) -> Result<AudioInfo, String> { probe(&app, &source).await }

#[tauri::command]
async fn make_preview(app: AppHandle, source: String, cents: f64, reference: Option<String>) -> Result<PreviewInfo, String> {
    validate_pitch(cents)?;
    let a_info = probe(&app, &source).await?;
    let reference_info = if let Some(ref path) = reference { Some(probe(&app, path).await?) } else { None };
    let dir = cache_root(&app)?;
    let key = cache_key(&source, cents, reference.as_deref());
    let original = dir.join(format!("{key}-a.wav"));
    let b = dir.join(format!("{key}-b.wav"));
    decode_wav(&app, &source, &original, None).await?;
    if let Some(ref input) = reference { decode_wav(&app, input, &b, None).await?; }
    else { decode_wav(&app, &source, &b, Some((cents, a_info.sample_rate))).await?; }
    let a_actual = probe(&app, &original.to_string_lossy()).await?;
    let b_actual = probe(&app, &b.to_string_lossy()).await?;
    app.asset_protocol_scope().allow_file(&original).map_err(|e| format!("Cannot load original in player: {e}"))?;
    app.asset_protocol_scope().allow_file(&b).map_err(|e| format!("Cannot load transformed file in player: {e}"))?;
    let a_wave = waveform_envelope(&app, &original).await?;
    let b_wave = waveform_envelope(&app, &b).await?;
    let (reference_signal_a, reference_signal_b) = if reference.is_some() {
        (Some(timing_envelope(&app, &original).await?), Some(timing_envelope(&app, &b).await?))
    } else { (None, None) };
    let effective_cents = if reference.is_some() { None } else {
        Some(1200.0 * ((a_info.sample_rate as f64 * validate_pitch(cents)?).round() / a_info.sample_rate as f64).log2())
    };
    Ok(PreviewInfo {
        original_path: original.to_string_lossy().into_owned(), b_path: b.to_string_lossy().into_owned(),
        original_duration: a_actual.duration, b_duration: b_actual.duration,
        source_file_duration: a_info.duration, reference_file_duration: reference_info.map(|x| x.duration),
        original_peaks: a_wave.peaks, b_peaks: b_wave.peaks,
        original_rms: a_wave.rms, b_rms: b_wave.rms,
        effective_cents, reference_signal_a, reference_signal_b,
        mode: if reference.is_some() { "reference" } else { "processed" }.into()
    })
}

fn safe_stem(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if "<>:\"/\\|?*".contains(c) || c.is_control() { out.push('_'); } else { out.push(c); }
    }
    let mut out = out.trim().trim_end_matches(&['.', ' '][..]).to_owned();
    if out.is_empty() { out = "Untitled".into(); }
    let upper = out.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str()) || ((upper.starts_with("COM") || upper.starts_with("LPT")) && upper.len() == 4 && upper.as_bytes()[3].is_ascii_digit() && upper.as_bytes()[3] != b'0') { out.insert(0, '_'); }
    out.chars().take(175).collect::<String>().trim_end_matches(&['.', ' '][..]).to_owned()
}

fn render_template(template: &str, info: &AudioInfo, cents: f64) -> Result<String, String> {
    let mut text = template.to_string();
    let values = [
        ("stem", info.stem.as_str()),
        ("title", info.tags.get("title").map(String::as_str).unwrap_or(&info.stem)),
        ("artist", info.tags.get("artist").map(String::as_str).unwrap_or("Unknown Artist")),
        ("album", info.tags.get("album").map(String::as_str).unwrap_or("Unknown Album")),
        ("track", info.tags.get("track").or_else(|| info.tags.get("tracknumber")).map(String::as_str).unwrap_or("")),
    ];
    for (name, value) in values { text = text.replace(&format!("{{{name}}}"), value); }
    let c = if cents > 0.0 { format!("+{}c", cents) } else { format!("{}c", cents) };
    text = text.replace("{cents}", &c);
    if text.contains('{') || text.contains('}') { return Err("Unknown filename token. Use {stem}, {cents}, {title}, {artist}, {album}, {track}.".into()); }
    Ok(safe_stem(&text))
}

fn unique_target(folder: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut result = folder.join(format!("{stem}.{ext}"));
    let mut n = 2;
    while result.exists() { result = folder.join(format!("{stem} ({n}).{ext}")); n += 1; }
    result
}

#[tauri::command]
async fn export_audio(app: AppHandle, request: ExportRequest) -> Result<String, String> {
    let rate = validate_pitch(request.cents)?;
    let info = probe(&app, &request.source).await?;
    let folder = Path::new(&request.folder);
    if !folder.is_dir() { return Err("Choose a valid export folder.".into()); }
    let (ext, codec): (&str, Vec<&str>) = match request.format.as_str() {
        "flac" => ("flac", vec!["-c:a", "flac"]),
        "wav" => ("wav", vec!["-c:a", "pcm_s24le"]),
        "mp3" => ("mp3", vec!["-c:a", "libmp3lame", "-b:a", "320k"]),
        "m4a" => ("m4a", vec!["-c:a", "aac", "-b:a", "256k"]),
        _ => return Err("Unsupported export format.".into())
    };
    let stem = match request.override_stem.as_deref().map(str::trim) {
        Some(s) if !s.is_empty() => safe_stem(s),
        _ => render_template(&request.template, &info, request.cents)?
    };
    let adjusted = (info.sample_rate as f64 * rate).round() as u32;
    let filter = format!("asetrate={adjusted},aresample={}:filter_size=64", info.sample_rate);
    // Render into a temporary file IN the output folder, then move to a unique final path.
    // Existing files are never deleted or intentionally overwritten.
    let random = NEXT_TMP.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp = folder.join(format!(".lutera-pending-{nanos}-{random}.{ext}"));
    let mut args = vec!["-hide_banner".into(), "-loglevel".into(), "error".into(), "-nostdin".into(), "-n".into(), "-i".into(), info.path,
        "-map".into(), "0:a:0".into(), "-map_metadata".into(), "0".into(), "-af".into(), filter];
    args.extend(codec.iter().map(|s| s.to_string()));
    args.push(temp.to_string_lossy().into_owned());
    if let Err(e) = tool(&app, "ffmpeg", args).await { let _ = fs::remove_file(&temp); return Err(e); }
    let mut attempt = 0;
    loop {
        let target = unique_target(folder, &stem, ext);
        match fs::rename(&temp, &target) {
            Ok(()) => return Ok(target.to_string_lossy().into_owned()),
            Err(e) if target.exists() && attempt < 5 => { attempt += 1; continue; }
            Err(e) => { let _ = fs::remove_file(&temp); return Err(format!("Cannot save export: {e}")); }
        }
    }
}

pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());
    // Only official signed releases get the updater key. Unsigned CI builds
    // remain usable without accidentally trusting a placeholder key.
    if let Some(pubkey) = option_env!("TAURI_UPDATER_PUBKEY") {
        if !pubkey.trim().is_empty() {
            builder = builder.plugin(tauri_plugin_updater::Builder::new().pubkey(pubkey).build());
        }
    }
    builder.setup(|app| {
            // Old decoded previews are ephemeral. Clear them on each launch.
            if let Ok(path) = app.path().app_cache_dir() {
                let previews = path.join("wave-previews");
                let _ = fs::remove_dir_all(&previews);
                let _ = fs::create_dir_all(&previews);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![choose_audio_files, choose_export_folder, inspect_audio, make_preview, export_audio])
        .run(tauri::generate_context!())
        .expect("Failed to start lūtera / varispeed");
}
