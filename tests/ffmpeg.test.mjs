import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ratio } from '../src/core.js';

const windowsTools = resolve('src-tauri', 'binaries');
const suffix = '-x86_64-pc-windows-msvc.exe';
function command(name) {
  const win = join(windowsTools, name + suffix);
  const a = spawnSync(win, ['-version'], { encoding: 'utf8' });
  return a.status === 0 ? win : name;
}
function usable(program) { return spawnSync(program, ['-version'], {encoding:'utf8'}).status === 0; }
function run(program, args) {
  const result = spawnSync(program, args, {encoding:'utf8', maxBuffer:1024*1024});
  assert.equal(result.status, 0, `${program} failed: ${result.stderr}`);
}
function duration(probe, file) {
  const output = spawnSync(probe, ['-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',file],{encoding:'utf8'});
  assert.equal(output.status, 0, output.stderr);
  return Number(output.stdout.trim());
}
function crossingFrequency(file) {
  const wav=readFileSync(file);
  let dataOffset = -1, dataSize = 0, pos = 12, samplerate = 0, channels = 0;
  while (pos + 8 <= wav.length) {
    const name = wav.toString('ascii',pos,pos+4), size = wav.readUInt32LE(pos+4);
    if (name === 'fmt ') { channels=wav.readUInt16LE(pos+10); samplerate=wav.readUInt32LE(pos+12); }
    if (name === 'data') { dataOffset=pos+8; dataSize=size; break; }
    pos += 8+size+(size%2);
  }
  assert.ok(dataOffset>0 && channels===1 && samplerate===44100);
  const n=Math.min(Math.floor(dataSize/2), 44100*3);
  let count=0, prev=wav.readInt16LE(dataOffset);
  for(let i=1;i<n;i++) { const now=wav.readInt16LE(dataOffset+i*2); if (prev<0 && now>=0) count++; prev=now; }
  return count/(n/samplerate);
}
const ffmpeg=command('ffmpeg'), ffprobe=command('ffprobe');

test('FFmpeg really changes pitch AND length together for -13c and +10c', { skip: !usable(ffmpeg) || !usable(ffprobe) }, () => {
  const dir=mkdtempSync(join(tmpdir(),'lutera-ffmpeg-test-'));
  try {
    const original=join(dir,'440.wav');
    run(ffmpeg,['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=4','-ac','1','-ar','44100','-c:a','pcm_s16le',original]);
    const originalDuration=duration(ffprobe,original);
    for(const cents of [-13,10]) {
      const output=join(dir,`test-${cents}.wav`);
      const rate=Math.round(44100*ratio(cents));
      run(ffmpeg,['-v','error','-y','-i',original,'-af',`asetrate=${rate},aresample=44100:filter_size=64`,'-ac','1','-ar','44100','-c:a','pcm_s16le',output]);
      const actual=duration(ffprobe,output);
      assert.ok(Math.abs(actual-originalDuration/(rate/44100))<.002, `Unexpected duration at ${cents}¢: ${actual}`);
      assert.ok(Math.abs(crossingFrequency(output)-440*(rate/44100))<1, `Unexpected note pitch at ${cents}¢`);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
