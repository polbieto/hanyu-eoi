#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>
#import <AppKit/AppKit.h>

NSString* ocrPage(PDFPage *page) {
    NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
    CGSize size = NSMakeSize(bounds.size.width * 2.0, bounds.size.height * 2.0);
    NSImage *img = [page thumbnailOfSize:size forBox:kPDFDisplayBoxMediaBox];
    CGImageRef cgImg = [img CGImageForProposedRect:NULL context:nil hints:nil];
    if (!cgImg) return @"";

    __block NSMutableArray<NSString *> *lines = [NSMutableArray array];
    VNRecognizeTextRequest *req = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:^(VNRequest *request, NSError *error) {
        for (VNRecognizedTextObservation *obs in request.results) {
            VNRecognizedText *top = [[obs topCandidates:1] firstObject];
            if (top.string) [lines addObject:top.string];
        }
    }];
    req.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    req.recognitionLanguages = @[@"zh-Hans", @"es-ES", @"en-US"];
    req.usesLanguageCorrection = YES;

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImg options:@{}];
    [handler performRequests:@[req] error:nil];
    return [lines componentsJoinedByString:@"\n"];
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc < 2) return 1;
        BOOL useOCR = (argc >= 3 && strcmp(argv[2], "--ocr") == 0);
        NSString *path = [NSString stringWithUTF8String:argv[1]];
        PDFDocument *doc = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:path]];
        if (!doc) {
            fprintf(stderr, "Failed to open %s\n", argv[1]);
            return 1;
        }
        printf("Total pages: %lu\n", (unsigned long)doc.pageCount);
        for (NSUInteger i = 0; i < doc.pageCount; i++) {
            @autoreleasepool {
                PDFPage *page = [doc pageAtIndex:i];
                NSString *txt = [page.string stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
                printf("=== PAGE %lu ===\n", (unsigned long)(i + 1));
                if (txt.length > 0) {
                    printf("[TEXT]\n%s\n", txt.UTF8String);
                }
                if (useOCR && txt.length < 15) {
                    NSString *ocr = ocrPage(page);
                    if (ocr.length > 0) {
                        printf("[OCR]\n%s\n", ocr.UTF8String);
                    }
                }
            }
        }
    }
    return 0;
}
