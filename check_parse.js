var fso = new ActiveXObject("Scripting.FileSystemObject");
var file = fso.OpenTextFile("script-v3.js", 1);
var src = file.ReadAll();
file.Close();
try {
  new Function(src);
  WScript.Echo("PARSE_OK");
} catch (e) {
  WScript.Echo("PARSE_ERROR: " + e.message);
}
