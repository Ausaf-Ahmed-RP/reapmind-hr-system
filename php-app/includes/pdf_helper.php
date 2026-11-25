<?php
/**
 * Lightweight Pure-PHP Multi-Image to PDF Compiler
 * Zero external libraries needed. Embeds JPEG/PNG images into a valid multi-page PDF.
 */

class SimpleImagePdf {
    public static function createFromImages(array $imagePaths, string $outputPath): bool {
        if (empty($imagePaths)) return false;

        $objects = [];
        $offsets = [];
        $pages = [];

        // Object 1: Catalog
        $objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

        // Object 2 will be Pages dict, populated later
        $pageCount = count($imagePaths);
        $objIndex = 3;

        $kids = [];
        $pageObjMap = [];

        foreach ($imagePaths as $idx => $imgFile) {
            if (!file_exists($imgFile)) continue;
            
            // Read image dimensions
            $info = @getimagesize($imgFile);
            if (!$info) continue;
            
            $width = $info[0] ?: 595;
            $height = $info[1] ?: 842;
            $mime = $info['mime'] ?? '';

            // We need JPEG for direct embedding; if PNG, convert to JPEG temp
            $isJpeg = ($mime === 'image/jpeg');
            $jpegData = '';

            if ($isJpeg) {
                $jpegData = file_get_contents($imgFile);
            } else if (function_exists('imagecreatefrompng')) {
                $src = @imagecreatefrompng($imgFile);
                if ($src) {
                    ob_start();
                    imagejpeg($src, null, 90);
                    $jpegData = ob_get_clean();
                    imagedestroy($src);
                }
            }

            if (empty($jpegData)) {
                $jpegData = file_get_contents($imgFile);
            }

            // Image XObject
            $imgObjId = $objIndex++;
            $streamLen = strlen($jpegData);
            $objects[$imgObjId] = "<< /Type /XObject /Subtype /Image /Width $width /Height $height /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length $streamLen >>\nstream\n" . $jpegData . "\nendstream";

            // Page Contents stream (draw image full size)
            $contentObjId = $objIndex++;
            $stream = "q\n$width 0 0 $height 0 0 cm\n/Im0 Do\nQ";
            $cLen = strlen($stream);
            $objects[$contentObjId] = "<< /Length $cLen >>\nstream\n" . $stream . "\nendstream";

            // Page Object
            $pageObjId = $objIndex++;
            $kids[] = "$pageObjId 0 R";
            $objects[$pageObjId] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 $width $height] /Resources << /XObject << /Im0 $imgObjId 0 R >> >> /Contents $contentObjId 0 R >>";
        }

        if (empty($kids)) return false;

        $kidsStr = implode(' ', $kids);
        $total = count($kids);
        $objects[2] = "<< /Type /Pages /Kids [$kidsStr] /Count $total >>";

        // Assemble PDF binary
        $out = "%PDF-1.4\n";
        $offsets[0] = 0;

        ksort($objects);
        foreach ($objects as $id => $obj) {
            $offsets[$id] = strlen($out);
            $out .= "$id 0 obj\n" . $obj . "\nendobj\n";
        }

        $xrefOffset = strlen($out);
        $out .= "xref\n0 " . (max(array_keys($objects)) + 1) . "\n";
        $out .= "0000000000 65535 f \n";

        for ($i = 1; $i <= max(array_keys($objects)); $i++) {
            if (isset($offsets[$i])) {
                $out .= sprintf("%010d 00000 n \n", $offsets[$i]);
            } else {
                $out .= "0000000000 65535 f \n";
            }
        }

        $out .= "trailer\n<< /Size " . (max(array_keys($objects)) + 1) . " /Root 1 0 R >>\nstartxref\n$xrefOffset\n%%EOF\n";

        return (bool)@file_put_contents($outputPath, $out);
    }
}
