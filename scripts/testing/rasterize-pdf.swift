// Rasterize a PDF to per-page JPEGs using macOS-native PDFKit (FIXPLAN_F P1.5).
// @napi-rs/canvas segfaults drawing this sample's JPEG2000 pages, and pdfjs's
// Node pairing needs wasm plumbing — PDFKit decodes both natively.
//
// Usage: swift rasterize-pdf.swift <input.pdf> <output-dir> [target-width-px]
import PDFKit
import AppKit

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: rasterize-pdf.swift <input.pdf> <output-dir> [width]") }
let pdfPath = args[1]
let outDir = args[2]
let targetWidth = args.count >= 4 ? CGFloat(Int(args[3]) ?? 1500) : 1500

guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else { fail("cannot open PDF: \(pdfPath)") }
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let scale = targetWidth / bounds.width
    let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
    let image = page.thumbnail(of: size, for: .mediaBox)
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else {
        fail("cannot encode page \(i + 1)")
    }
    let out = URL(fileURLWithPath: outDir).appendingPathComponent(String(format: "p%02d.jpg", i + 1))
    try! jpg.write(to: out)
    print("page \(i + 1)/\(doc.pageCount): \(Int(size.width))x\(Int(size.height)) -> \(out.path)")
}
print("DONE \(doc.pageCount) pages")
