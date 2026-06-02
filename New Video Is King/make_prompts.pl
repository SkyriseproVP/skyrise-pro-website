#!/usr/bin/perl
use strict;
use warnings;
use IO::Compress::Zip qw(zip $ZipError :zip_method);

# ── helpers ──────────────────────────────────────────────────────────────────

sub esc { my $t = shift; $t =~ s/&/&amp;/g; $t =~ s/</&lt;/g; $t =~ s/>/&gt;/g; $t =~ s/"/&quot;/g; return $t; }

sub run {
    my ($text, %o) = @_;
    my $rpr = '<w:rPr>';
    my $font = $o{mono} ? 'Consolas' : 'Arial';
    $rpr .= "<w:rFonts w:ascii=\"$font\" w:hAnsi=\"$font\"/>";
    $rpr .= '<w:sz w:val="' . ($o{sz} || 22) . '"/>';
    $rpr .= '<w:szCs w:val="' . ($o{sz} || 22) . '"/>';
    $rpr .= '<w:b/>' if $o{bold};
    $rpr .= '<w:i/>' if $o{italic};
    $rpr .= '<w:color w:val="' . ($o{color} || '0A0F1E') . '"/>';
    $rpr .= '<w:spacing w:val="' . $o{spacing} . '"/>' if $o{spacing};
    $rpr .= '</w:rPr>';
    return "<w:r>$rpr<w:t xml:space=\"preserve\">" . esc($text) . '</w:t></w:r>';
}

sub para {
    my ($content, %o) = @_;
    my $ppr = '<w:pPr>';
    $ppr .= '<w:jc w:val="' . $o{align} . '"/>' if $o{align};
    if ($o{before} || $o{after}) {
        my $b = $o{before} || 0; my $a = $o{after} || 0;
        $ppr .= "<w:spacing w:before=\"$b\" w:after=\"$a\"/>";
    }
    if ($o{border_bottom}) {
        $ppr .= '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="00C8E8"/></w:pBdr>';
    }
    if ($o{box}) {
        my $c = $o{box};
        $ppr .= "<w:pBdr><w:top w:val=\"single\" w:sz=\"6\" w:space=\"4\" w:color=\"$c\"/><w:left w:val=\"single\" w:sz=\"6\" w:space=\"4\" w:color=\"$c\"/><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"4\" w:color=\"$c\"/><w:right w:val=\"single\" w:sz=\"6\" w:space=\"4\" w:color=\"$c\"/></w:pBdr>";
    }
    if ($o{border_left}) {
        $ppr .= '<w:pBdr><w:left w:val="single" w:sz="16" w:space="6" w:color="' . $o{border_left} . '"/></w:pBdr>';
    }
    if ($o{shading}) {
        $ppr .= '<w:shd w:val="clear" w:color="auto" w:fill="' . $o{shading} . '"/>';
    }
    if ($o{indent}) {
        $ppr .= '<w:ind w:left="' . $o{indent} . '" w:right="' . ($o{indent_r}//$o{indent}) . '"/>';
    }
    $ppr .= '</w:pPr>';
    return "<w:p>$ppr$content</w:p>\n";
}

sub gap  { my $p = shift || 200; return para('', before => $p, after => 0); }
sub rule { return para('', before => 200, after => 200, border_bottom => 1); }
sub page_break { return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>\n"; }

# Centered inline image. $rid -> relationship, cx/cy in EMU (914400 = 1 inch).
my $img_uid = 100;
sub image_para {
    my ($rid, $cx, $cy, $name, %o) = @_;
    my $id = $img_uid++;
    my $draw =
      '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" '
      . 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      . 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      . 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      . "<wp:extent cx=\"$cx\" cy=\"$cy\"/>"
      . '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
      . "<wp:docPr id=\"$id\" name=\"$name\"/>"
      . '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      . '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      . "<pic:pic><pic:nvPicPr><pic:cNvPr id=\"$id\" name=\"$name\"/><pic:cNvPicPr/></pic:nvPicPr>"
      . "<pic:blipFill><a:blip r:embed=\"$rid\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>"
      . "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"$cx\" cy=\"$cy\"/></a:xfrm>"
      . '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
      . '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>';
    my $align = $o{align} || 'center';
    return "<w:p><w:pPr><w:jc w:val=\"$align\"/><w:spacing w:before=\"0\" w:after=\"0\"/></w:pPr><w:r>$draw</w:r></w:p>\n";
}

sub heading {
    my ($text, %o) = @_;
    return para(run($text, bold=>1, sz=>($o{sz}||32), color=>($o{color}||'0A0F1E')), before=>340, after=>140);
}
sub section_label {
    my ($text, %o) = @_;
    return para(run(uc($text), bold=>1, sz=>18, color=>($o{color}||'FF6B35'), spacing=>60), before=>0, after=>80);
}
sub body_para {
    my ($text, %o) = @_;
    return para(run($text, sz=>21, color=>($o{color}||'0A0F1E'), italic=>$o{italic}, bold=>$o{bold}),
        before=>80, after=>80, shading=>$o{shading}, border_left=>$o{border_left}, indent=>$o{indent}, box=>$o{box});
}
sub italic_para {
    my ($text) = @_;
    return para(run($text, sz=>20, color=>'555555', italic=>1), before=>60, after=>60);
}

# code/prompt box: monospace text in a light box for easy copy
sub prompt_box {
    my ($text) = @_;
    return para(run($text, sz=>19, color=>'0A1A2E', mono=>1),
        before=>40, after=>40, shading=>'EAF3F8', box=>'00C8E8', indent=>120, indent_r=>120);
}

# ── table primitives ─────────────────────────────────────────────────────────

sub cell {
    my ($content_xml, $width, %o) = @_;
    my $fill = $o{fill} || 'FFFFFF';
    my $bclr = $o{bclr} || 'D0E8F0';
    my $bdr = "<w:tcBorders>" .
              "<w:top w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "<w:left w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "<w:bottom w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "<w:right w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/></w:tcBorders>";
    my $shd = "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"$fill\"/>";
    my $mar = "<w:tcMar><w:top w:w=\"80\" w:type=\"dxa\"/><w:left w:w=\"120\" w:type=\"dxa\"/><w:bottom w:w=\"80\" w:type=\"dxa\"/><w:right w:w=\"120\" w:type=\"dxa\"/></w:tcMar>";
    return "<w:tc><w:tcPr><w:tcW w:w=\"$width\" w:type=\"dxa\"/>$bdr$shd$mar</w:tcPr>$content_xml</w:tc>";
}
sub hdr_cell {
    my ($text, $width) = @_;
    return cell(para(run($text, bold=>1, sz=>18, color=>'00C8E8', spacing=>60), before=>0, after=>0), $width, fill=>'0A0F1E', bclr=>'00C8E8');
}
sub tbl {
    my ($total_w, $col_widths, $rows_xml) = @_;
    my $cols = join('', map { "<w:gridCol w:w=\"$_\"/>" } @$col_widths);
    return "<w:tbl><w:tblPr><w:tblW w:w=\"$total_w\" w:type=\"dxa\"/>" .
           "<w:tblBorders><w:insideH w:val=\"single\" w:sz=\"1\" w:color=\"D0E8F0\"/><w:insideV w:val=\"single\" w:sz=\"1\" w:color=\"D0E8F0\"/></w:tblBorders>" .
           "</w:tblPr><w:tblGrid>$cols</w:tblGrid>$rows_xml</w:tbl>\n";
}
sub trow { return "<w:tr>" . join('', @_) . "</w:tr>"; }

# ── DOCUMENT BODY ────────────────────────────────────────────────────────────

my $body = '';

# COVER
$body .= gap(1000);
$body .= image_para('rId3', 3429000, 1929375, 'SkyriseLogo');  # 3.75in wide, 16:9
$body .= gap(160);
$body .= para(run('"COURT VISION"', bold=>1, sz=>40, color=>'0A0F1E', spacing=>40), align=>'center', before=>0, after=>0);
$body .= gap(200);
{
    my $r = run('AI VIDEO PROMPT SHEET', bold=>1, sz=>34, color=>'0A0F1E');
    my $ppr = '<w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/><w:pBdr><w:top w:val="single" w:sz="12" w:space="2" w:color="FF6B35"/><w:bottom w:val="single" w:sz="12" w:space="2" w:color="FF6B35"/></w:pBdr></w:pPr>';
    $body .= "<w:p>$ppr$r</w:p>\n";
}
$body .= gap(200);
$body .= para(run('Shot-by-shot generation prompts for Sora, Veo 3, Runway & Kling', sz=>22, color=>'555555', italic=>1), align=>'center', before=>0, after=>0);
$body .= gap(160);
$body .= para(run('22 CLIPS  |  TOTAL RUNTIME 1:30  |  ASPECT 2.39:1', bold=>1, sz=>20, color=>'00C8E8', spacing=>120), align=>'center', before=>0, after=>0);
$body .= gap(420);
$body .= para(run('Companion to: court_vision_treatment.docx', sz=>18, color=>'888888'), align=>'center', before=>0, after=>0);
$body .= para(run('Version 1.0   Skyrise Pro Creative Division', sz=>18, color=>'888888'), align=>'center', before=>40, after=>0);
$body .= page_break();

# ── HOW TO USE ───────────────────────────────────────────────────────────────
$body .= heading('HOW TO USE THIS SHEET', sz=>30);
$body .= rule();
$body .= gap(60);
$body .= body_para('Each clip below is a self-contained prompt. AI video tools have no memory between generations, so the LOOK of your five men must be re-described every time. That is what the Character Bible and Style Tokens are for: paste them into every prompt so the same people show up in every shot.');
$body .= gap(80);

$body .= section_label('THE WORKFLOW', color=>'FF6B35');
$body .= body_para('1.  Pick your model (see below). Set aspect ratio to 2.39:1 (or 16:9 and crop in edit).');
$body .= body_para('2.  For each clip, paste: [STYLE TOKENS] + [the clip PROMPT] + [relevant CHARACTER BIBLE lines] + [NEGATIVE PROMPT].');
$body .= body_para('3.  Generate 2-3 takes per clip. Keep the best. Re-roll any with warped faces, hands, or ball.');
$body .= body_para('4.  Most AI video is silent or has unreliable audio. Generate VISUALS only, then add sneaker squeaks, crowd, and score in the edit (see Audio Post section at the end).');
$body .= body_para('5.  Assemble in CapCut, Premiere, or DaVinci Resolve in the clip order. Trim each to the listed duration. Total target: 1:30.');
$body .= gap(120);

$body .= section_label('MODEL RECOMMENDATIONS', color=>'FF6B35');
{
    my $hdr = trow(hdr_cell('MODEL', 2200), hdr_cell('BEST FOR', 3400), hdr_cell('NOTES', 3760));
    my @rows = (
        ['Google Veo 3', 'Native audio + realism', 'Best overall. Generates synced sound effects — can produce sneaker squeaks and crowd natively. Strongest for the hero shots.'],
        ['OpenAI Sora', 'Cinematic motion', 'Excellent camera moves and slow motion. Silent — add audio in post. Great for the crossover and buzzer.'],
        ['Runway Gen-4', 'Control + consistency', 'Use image-to-video: lock a character still first, then animate. Best for keeping the 5 men consistent.'],
        ['Kling 2.1', 'Value + long clips', 'Strong physics on the ball. Good budget option for the passing sequence.'],
    );
    my $rx = $hdr;
    for my $r (@rows) {
        $rx .= trow(
            cell(para(run($r->[0], bold=>1, sz=>19, color=>'0A0F1E'), before=>0,after=>0), 2200, fill=>'D5E8F0'),
            cell(para(run($r->[1], sz=>19, color=>'FF6B35', bold=>1), before=>0,after=>0), 3400),
            cell(para(run($r->[2], sz=>18, color=>'0A0F1E'), before=>0,after=>0), 3760),
        );
    }
    $body .= tbl(9360, [2200,3400,3760], $rx);
}
$body .= gap(100);
$body .= body_para('TIP: For maximum character consistency, generate one clean portrait of each of the five men first (front-lit, neutral), then use image-to-video so every clip starts from the same face.', italic=>1, shading=>'FFF4EF', border_left=>'FF6B35', indent=>200);
$body .= page_break();

# ── STYLE TOKENS ─────────────────────────────────────────────────────────────
$body .= heading('GLOBAL STYLE TOKENS', sz=>30);
$body .= rule();
$body .= gap(40);
$body .= body_para('Paste this block at the START of every single prompt. It locks the cinematic look across all 22 clips.');
$body .= gap(60);
$body .= prompt_box('Cinematic commercial, anamorphic 2.39:1 widescreen, shot on ARRI Alexa with vintage anamorphic lenses, teal-and-orange color grade, warm skin tones, cool cyan shadows, shallow depth of field, subtle lens flares, volumetric god-rays, photorealistic, hyper-detailed, 4K, 24fps with cinematic motion blur, professional color grading, film grain.');
$body .= gap(120);

$body .= heading('NEGATIVE PROMPT', sz=>24, color=>'FF6B35');
$body .= body_para('Append to every prompt (or paste in the negative field where supported).');
$body .= gap(60);
$body .= prompt_box('cartoon, anime, illustration, 3D render look, video-game graphics, distorted faces, deformed hands, extra fingers, extra limbs, warped basketball, melting ball, floating limbs, text artifacts, watermark, logo glitch, blurry, low quality, oversaturated, plastic skin, uncanny eyes, jersey numbers changing, duplicate players.');
$body .= page_break();

# ── CHARACTER BIBLE ──────────────────────────────────────────────────────────
$body .= heading('CHARACTER BIBLE', sz=>30);
$body .= rule();
$body .= gap(40);
$body .= body_para('These descriptions keep your cast identical across separate generations. Copy the relevant line(s) into each clip prompt. The team wears Skyrise Pro colors: NAVY jerseys with CYAN trim, wordmark "SKYRISE" across the chest.');
$body .= gap(80);

{
    my $hdr = trow(hdr_cell('ROLE', 1900), hdr_cell('# / SUIT', 1500), hdr_cell('LOCKED APPEARANCE (paste into prompts)', 5960));
    my @rows = (
        ['Leasing Agent (Point Guard / Magic)', '#32 / charcoal suit',
         'A tall athletic Black man, early 30s, 6ft3, lean build, short fade haircut, clean-shaven, warm confident eyes. The floor general. Navy "SKYRISE" jersey number 32.'],
        ['Landlord (Power Forward / takes final shot)', '#1 / navy suit',
         'A broad-shouldered white man, early 40s, 6ft2, salt-and-pepper short hair, light stubble, commanding calm presence. Navy "SKYRISE" jersey number 1.'],
        ['Architect (Small Forward)', '#4 / slate-grey suit',
         'A lean Latino man, mid 30s, 6ft1, dark swept-back hair, neat short beard, expressive face. Navy "SKYRISE" jersey number 4.'],
        ['Engineer (Shooting Guard)', '#11 / dark-blue suit',
         'An East Asian man, early 30s, 5ft11, athletic, short tidy black hair, clean-shaven, precise focused expression, thin modern glasses. Navy "SKYRISE" jersey number 11.'],
        ['General Contractor (Center / crossover)', '#50 / charcoal suit',
         'A powerfully built Black man, late 30s, 6ft5, muscular, bald head, full short beard, intense. Navy "SKYRISE" jersey number 50.'],
        ['Inspector (defender / villain)', 'opponent / grey',
         'A wiry older white man, late 40s, 6ft0, thinning grey hair, stern expression. Wears a plain CHARCOAL-GREY opponent jersey (no Skyrise wordmark) so he reads as the rival.'],
        ['Referee', 'official',
         'A neutral middle-aged official in a classic black-and-white vertical striped referee shirt, black shorts, whistle. Appears only at the jump ball.'],
    );
    my $rx = $hdr;
    for my $r (@rows) {
        $rx .= trow(
            cell(para(run($r->[0], bold=>1, sz=>18, color=>'0A0F1E'), before=>0,after=>0), 1900, fill=>'D5E8F0'),
            cell(para(run($r->[1], sz=>17, color=>'FF6B35', bold=>1), before=>0,after=>0), 1500),
            cell(para(run($r->[2], sz=>18, color=>'0A0F1E'), before=>0,after=>0), 5960),
        );
    }
    $body .= tbl(9360, [1900,1500,5960], $rx);
}
$body .= gap(100);
$body .= body_para('NOTE ON #32: the Leasing Agent wears number 32 as a deliberate homage to Magic Johnson, whose court vision the whole film is built around.', italic=>1, shading=>'E8F4FB', border_left=>'00C8E8', indent=>200);
$body .= page_break();

# ── CLIP PROMPTS ─────────────────────────────────────────────────────────────
# clip = [num, timecode, dur, act, title, PROMPT, camera, who]
sub clip_block {
    my ($num, $tc, $dur, $title, $prompt, $camera, $who) = @_;
    my $out = '';
    # header line
    $out .= para(
        run("CLIP $num   ", bold=>1, sz=>24, color=>'FF6B35') .
        run($title, bold=>1, sz=>24, color=>'0A0F1E'),
        before=>200, after=>40
    );
    $out .= para(
        run("Timecode $tc   |   Duration ~${dur}s", sz=>18, color=>'00A0C0', bold=>1),
        before=>0, after=>60
    );
    $out .= section_label('PROMPT  (paste after Style Tokens)', color=>'FF6B35');
    $out .= prompt_box($prompt);
    $out .= para(run('Camera: ', bold=>1, sz=>18, color=>'0A0F1E') . run($camera, sz=>18, color=>'444444'), before=>60, after=>20);
    $out .= para(run('Characters in shot: ', bold=>1, sz=>18, color=>'0A0F1E') . run($who, sz=>18, color=>'444444'), before=>0, after=>120);
    return $out;
}

# ACT I
$body .= para(run('ACT I  —  THE MEETING OF MINDS', bold=>1, sz=>20, color=>'00C8E8', spacing=>200), before=>0, after=>40);
$body .= heading('0:00 - 0:16   Downtown NYC', sz=>26);
$body .= rule();

$body .= clip_block('01', '0:00-0:05', 5, 'AERIAL — City Reveal',
    'Aerial drone shot descending over the Manhattan skyline at golden-hour dusk, glass skyscrapers catching warm orange sunlight, a commercial construction corridor below with cranes silhouetted against the sky, slow majestic push-in, the city glowing.',
    'Drone, slow downward push-in.', 'None (cityscape).');

$body .= clip_block('02', '0:05-0:10', 5, 'WIDE — Five Men Converge',
    'Street level between two glass towers at dusk, five powerful businessmen in sharp tailored suits (charcoal, navy, slate-grey) walking toward each other and gathering in a tight circle, backlit by the setting sun, confident unhurried body language, lens flare, cinematic silhouettes, the men who own the city.',
    'Slow dolly-in, low angle.', 'All five principals (in suits).');

$body .= clip_block('03', '0:10-0:13', 3, 'CLOSE — The Read',
    'Tight slow push across the faces of five confident businessmen standing in a circle at dusk, each man surveying the others with quiet strategic intensity, warm rim light on their faces, shallow depth of field, no words, pure presence.',
    'Slow lateral push, rack focus face to face.', 'All five (in suits), faces.');

$body .= clip_block('04', '0:13-0:16', 3, 'OVERHEAD — The Formation',
    'Overhead aerial looking straight down at five businessmen in suits standing in a pentagon formation on a city sidewalk at dusk, the city grid stretching outward in every direction, they are the center of it, then one man gestures and they begin to loosen their ties and break into a jog.',
    'Top-down drone, holds then tilts.', 'All five (in suits).');

$body .= page_break();

# ACT II TUNNEL
$body .= para(run('ACT II  —  THE TUNNEL  (Transformation)', bold=>1, sz=>20, color=>'00C8E8', spacing=>200), before=>0, after=>40);
$body .= heading('0:16 - 0:38   The Suit Rip', sz=>26);
$body .= rule();

$body .= clip_block('05', '0:16-0:21', 5, 'JOG — Into Motion',
    'Five men in business suits jogging in unison down a city street at dusk, athletic and fluid not stiff, ties loosening, the city blurring behind them in motion, dynamic tracking shot from the front, energy building, cinematic.',
    'Stabilized tracking, moving backward ahead of them.', 'All five (suits, jogging).');

$body .= clip_block('06', '0:21-0:25', 4, 'TUNNEL — The Threshold',
    'Five men in suits jogging into a long concrete tunnel, fluorescent light glowing at the far end, dramatic shadows multiplying on the walls, moody volumetric lighting, the camera following from behind, gritty cinematic atmosphere.',
    'Tracking from behind, into the light.', 'All five (suits, jogging).');

$body .= clip_block('07', '0:25-0:31', 6, 'THE REVEAL — Suits Rip Away',
    'Slow motion, athletic men sprinting through a tunnel tearing their business suits off their bodies in one explosive motion, the suit jackets ripping away from the shoulders to reveal navy basketball jerseys underneath, fabric flying through the air, transformation from businessmen into basketball players, dramatic backlight, powerful, 120fps slow motion.',
    'Slow motion tracking, rapid energy.', 'All five (suits tearing to jerseys).');

$body .= clip_block('08', '0:31-0:34', 3, 'DETAIL — Empires Fall',
    'Extreme close-up slow motion of business suit jackets and a silk tie hitting a concrete tunnel floor, fabric settling gracefully, polished dress shoes left behind as basketball sneakers run past gripping the concrete, symbolic, cinematic, shallow focus.',
    'Low close-up, slow motion.', 'Feet / discarded suits.');

$body .= clip_block('09', '0:34-0:38', 4, 'HERO — Out of the Tunnel',
    'Five athletic men in matching navy basketball jerseys exploding out of the end of a tunnel into a bright luxurious indoor basketball gym, backlit silhouettes emerging into glowing light, full speed, transformed and unstoppable, epic hero shot.',
    'Wide, from inside gym looking at tunnel mouth.', 'All five (full jerseys).');

$body .= page_break();

# COURT VISION
$body .= para(run('ACT II  —  COURT VISION  (Every Pass = A Deal Stage)', bold=>1, sz=>20, color=>'00C8E8', spacing=>120), before=>0, after=>40);
$body .= heading('0:38 - 1:10   The Play', sz=>26);
$body .= rule();
$body .= body_para('The court matches the reference image: pristine pale hardwood, vaulted wood-beam ceiling, tall glass walls and skylights. Add this location line to each court prompt: "luxurious indoor basketball court with pale glossy hardwood, high vaulted wooden-beam ceiling, floor-to-ceiling glass walls, skylights, bright natural light."', italic=>1, shading=>'E8F4FB', border_left=>'00C8E8', indent=>200);
$body .= gap(60);
$body .= body_para('THE PASSING MIRRORS THE REAL DEAL — including the give-and-go back to the hub: LOI (Leasing Agent) -> Owner Review (Landlord) -> Pre-Con Bids (Contractor) -> BACK to Landlord/PM (Proposal Review) -> BACK to Leasing Agent (Lease Signing) -> Architect -> Engineer -> Contractor. Burn a lower-third deal-stage label into each clip in the edit.', bold=>1, shading=>'FFF4EF', border_left=>'FF6B35', indent=>200);
$body .= gap(80);

$body .= clip_block('10', '0:38-0:42', 4, 'JUMP BALL — Tip Off',
    'Low angle looking up, a referee in black-and-white stripes tosses a basketball into the air for a jump ball inside a luxurious skylit basketball court, two tall players in navy jerseys leap upward to tip it, slow motion, the ball against the vaulted ceiling, dramatic, the game begins.',
    'Low angle hero, 120fps. LABEL: none.', 'Leasing Agent #32, Contractor #50, Referee.');

$body .= clip_block('11', '0:42-0:46', 4, 'PASS 1 — No-Look (LOI to Owner Review)',
    'A tall Black point guard in a navy number 32 jersey dribbles left while looking the opposite direction, eyes locked downcourt, then whips a no-look behind-the-vision skip pass across the court to a broad-shouldered teammate, Magic Johnson style court vision, he never looks at the ball, slow motion, luxurious skylit hardwood court, sneakers squeaking.',
    'Overhead-to-side tracking. LABEL: "LOI SIGNED -> OWNER REVIEW".', 'Leasing Agent #32 to Landlord #1.');

$body .= clip_block('12', '0:46-0:50', 4, 'PASS 2 — Pre-Con Bids',
    'A broad-shouldered player in a navy number 1 jersey catches a basketball, surveys, then threads a sharp bounce pass to a powerful bald teammate at the top of the key, decisive and confident, slow motion, bright luxurious indoor basketball court with glass walls, sneakers squeaking.',
    'Tight tracking, ball hand-to-hand. LABEL: "PRE-CON BIDS".', 'Landlord #1 to Contractor #50.');

$body .= clip_block('13', '0:50-0:54', 4, 'PASS 3 — Give-and-Go (Proposal Review)',
    'A powerful bald player in a navy number 50 jersey immediately passes the basketball BACK to the broad-shouldered number 1 player who set it up, a quick give-and-go return pass, the ball returning to the playmaker hub, slow motion, luxurious skylit hardwood court, sneakers squeaking as both reset their feet.',
    'Slow-mo on the return pass. LABEL: "PROPOSAL REVIEW (PM)".', 'Contractor #50 back to Landlord #1 (PM).');

$body .= clip_block('14', '0:54-0:58', 4, 'PASS 4 — Give-and-Go (Lease Signing)',
    'A broad-shouldered player in a navy number 1 jersey swings the basketball BACK across the court to the tall number 32 point guard, a wide give-and-go pass returning to the floor general who catches it and pivots upcourt, slow motion, luxurious indoor basketball court, crisp pass, sneakers squeaking on hardwood.',
    'Wide give-and-go across the floor. LABEL: "LEASE FOLLOW-UP & SIGNING".', 'Landlord #1 back to Leasing Agent #32.');

$body .= clip_block('15', '0:58-1:02', 4, 'PASS 5 — Design Begins',
    'A tall Black point guard in a navy number 32 jersey delivers a slick dish to a lean Latino teammate in a number 4 jersey cutting along the baseline, the play opening up, graceful, slow motion, skylit hardwood court, athletic, sneakers squeaking.',
    'Side-angle slow motion. LABEL: "DESIGN BEGINS".', 'Leasing Agent #32 to Architect #4.');

$body .= clip_block('16', '1:02-1:06', 4, 'PASS 6 — Engineering',
    'A lean Latino player in a navy number 4 jersey catches and in one fluid motion redirects the basketball with a quick touch pass to an East Asian teammate in a number 11 jersey with thin glasses spotting up at the elbow, precise, slow motion side angle, skylit hardwood court.',
    'Quick touch pass, slow motion. LABEL: "ENGINEERING".', 'Architect #4 to Engineer #11.');

$body .= clip_block('17', '1:06-1:10', 4, 'PASS 7 — Construction (The Drive)',
    'An East Asian player in a navy number 11 jersey with thin glasses pivots and throws a high arcing lob pass to a powerful bald teammate in a number 50 jersey driving hard down the lane who catches it in stride, dynamic, slow motion, luxurious indoor court, sneakers squeaking on hardwood.',
    'Low angle tracking the drive. LABEL: "CONSTRUCTION".', 'Engineer #11 to Contractor #50.');

$body .= page_break();

# CROSSOVER
$body .= para(run('THE CROSSOVER  —  The Inspector', bold=>1, sz=>20, color=>'00C8E8', spacing=>200), before=>0, after=>40);
$body .= heading('1:10 - 1:18   Broken Ankles', sz=>26);
$body .= rule();

$body .= clip_block('18', '1:10-1:13', 3, 'INTRUSION — The Defender',
    'A wiry older man in a plain charcoal-grey opponent jersey slides into defensive position, low and stern, squaring up against a powerful bald player in a navy number 50 jersey holding a basketball, tension, sparse moody lighting, luxurious indoor court.',
    'Medium, slight push-in. LABEL: "FINAL INSPECTION".', 'Inspector (grey) vs Contractor #50.');

$body .= clip_block('19', '1:13-1:18', 5, 'THE CROSSOVER — Ankles',
    'Ultra slow motion 240fps, a powerful bald basketball player in a navy number 50 jersey explodes into a lightning between-the-legs crossover dribble, the grey-jerseyed defender stumbles and slips, his planted foot sliding out from under him, completely broken down, then a quick beat of reluctant respect, dramatic isolated spotlight, the most dominant move of the game.',
    'Ultra slow motion, low hero angle.', 'Contractor #50 crosses Inspector.');

$body .= page_break();

# BUZZER
$body .= para(run('ACT III  —  THE BUZZER BEATER', bold=>1, sz=>20, color=>'00C8E8', spacing=>200), before=>0, after=>40);
$body .= heading('1:18 - 1:30   The Close', sz=>26);
$body .= rule();

$body .= clip_block('20', '1:18-1:21', 3, 'PASS BACK + CLOCK',
    'A basketball player passes the ball back to a broad-shouldered teammate in a navy number 1 jersey standing at the half-court line, he catches and sets his feet, everything slowing down, intercut with a close-up of a glowing red scoreboard clock ticking down 0:03, 0:02, dramatic tension, luxurious skylit court.',
    'Wide + insert of clock. LABEL: "C OF O CLEARED".', 'Landlord #1 (PM) receives at half court.');

$body .= clip_block('21', '1:21-1:24', 3, 'THE SHOT — Half Court',
    'Epic slow motion, a confident player in a navy number 1 jersey rises up from the half-court line and launches a long basketball shot, perfect form, holding the follow-through, the ball leaving his fingertips, dramatic low hero angle looking up, everything riding on this.',
    'Low hero angle, extreme slow motion. LABEL: "RENT COMMENCEMENT".', 'Landlord #1 shooting.');

$body .= clip_block('22', '1:24-1:30', 6, 'THE SWISH + ERUPTION',
    'Slow motion basketball flying in a perfect arc the full length of a luxurious skylit court and dropping cleanly through the net without touching the rim, a perfect swish, the buzzer flashes, then five players in navy jerseys erupt with arms raised in triumph, confetti light, pure victory, cinematic celebration, then fade to a clean dark frame.',
    'Ball-tracking into net, then wide on team.', 'Ball + all five celebrate.');

$body .= gap(120);
$body .= body_para('END CARD (add in edit, not generated): hold a dark frame, fade up the Skyrise Pro logo with the line "AUTOMATE THE WORKFLOW. HONOR THE WORK." and "skyrisepro.com". 2-3 seconds, inside the 1:30.', italic=>1, shading=>'FFF4EF', border_left=>'FF6B35', indent=>200);
$body .= page_break();

# ── AUDIO POST ───────────────────────────────────────────────────────────────
$body .= heading('AUDIO POST-PRODUCTION', sz=>30);
$body .= rule();
$body .= gap(40);
$body .= body_para('Generate clips for VISUALS. Unless you use Veo 3 (native audio), add all sound in your editor. This is where the film comes alive — especially the sneaker squeaks you asked for.');
$body .= gap(80);

{
    my $hdr = trow(hdr_cell('LAYER', 2400), hdr_cell('WHERE', 2600), hdr_cell('SOURCE / NOTES', 4360));
    my @rows = (
        ['Sneaker squeaks (signature)', 'Every plant, cut, pivot in clips 10-22', 'Loud and present, on top of the music. The crossover (clip 19) gets ONE big isolated screech. Search "basketball sneaker squeak hardwood" on Epidemic Sound / Artlist / freesound.'],
        ['Ball bounce / pass snap', 'Clips 11-17, 20', 'Crisp dribble thuds and the slap of the ball into hands. Sells the passing and the give-and-go.'],
        ['Crowd / arena', 'Builds from clip 15, erupts clip 21', 'Low murmur during the play, gasp on the crossover, full eruption on the swish. "NBA arena crowd cheer".'],
        ['Buzzer', 'Exact moment of swish, clip 21', 'Classic game buzzer hit. One beat of silence BEFORE it for impact.'],
        ['Music score', 'Throughout', 'Cinematic orchestral + hip-hop percussion. Drops hard out of the tunnel (clip 09). Strips to near-silence for the shot (clip 20). Try Epidemic Sound "epic cinematic sport" or a licensed trailer track.'],
        ['Whoosh / impact FX', 'Suit rip clip 07, transitions', 'Sub-bass whoosh on the suit tear and on hard cuts between acts.'],
    );
    my $rx = $hdr;
    for my $r (@rows) {
        $rx .= trow(
            cell(para(run($r->[0], bold=>1, sz=>18, color=>'0A0F1E'), before=>0,after=>0), 2400, fill=>'D5E8F0'),
            cell(para(run($r->[1], sz=>18, color=>'FF6B35'), before=>0,after=>0), 2600),
            cell(para(run($r->[2], sz=>18, color=>'0A0F1E'), before=>0,after=>0), 4360),
        );
    }
    $body .= tbl(9360, [2400,2600,4360], $rx);
}
$body .= gap(160);

# ── ASSEMBLY CHECKLIST ───────────────────────────────────────────────────────
$body .= heading('ASSEMBLY CHECKLIST', sz=>30);
$body .= rule();
$body .= gap(60);
$body .= body_para('[  ]  Generate all 22 clips (2-3 takes each), keep best, re-roll warped faces/hands/ball.');
$body .= body_para('[  ]  Drop clips into the timeline in order 01 to 22.');
$body .= body_para('[  ]  Trim each to its listed duration; total must land at or under 1:30.');
$body .= body_para('[  ]  Add deal-stage lower-thirds as the ball arrives each pass (clips 11-21): LOI, OWNER REVIEW, PRE-CON BIDS, PROPOSAL REVIEW, LEASE SIGNING, DESIGN, ENGINEERING, CONSTRUCTION, FINAL INSPECTION, C OF O, RENT COMMENCEMENT.');
$body .= body_para('[  ]  Layer audio: sneakers, ball, crowd, buzzer, score (see Audio Post).');
$body .= body_para('[  ]  Add the Skyrise Pro end card with logo + tagline + URL.');
$body .= body_para('[  ]  Final color pass for consistent teal-and-orange grade across all clips.');
$body .= body_para('[  ]  Export master 1:30, then cut :30 and :15 social versions.');
$body .= gap(300);

$body .= para(run('SKYRISE PRO — AUTOMATE THE WORKFLOW. HONOR THE WORK.', bold=>1, sz=>20, color=>'00C8E8', spacing=>150), align=>'center', before=>0, after=>60);
$body .= gap(200);
$body .= image_para('rId4', 1143000, 1143000, 'SkyriseQR');  # 1.25in square
$body .= para(run('Scan to visit skyrisepro.com', sz=>16, color=>'888888', spacing=>40), align=>'center', before=>80, after=>0);

# ── ASSEMBLE DOCX ────────────────────────────────────────────────────────────
my $document_xml = <<'DOCHEAD';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14">
<w:body>
DOCHEAD
$document_xml .= $body;
$document_xml .= <<'DOCTAIL';
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body></w:document>
DOCTAIL

my $content_types = <<'CT';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>
CT

my $rels = <<'RELS';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
RELS

my $doc_rels = <<'DOCRELS';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/>
</Relationships>
DOCRELS

my $styles_xml = <<'STYLES';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style>
</w:styles>
STYLES

my $settings_xml = <<'SETTINGS';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/></w:settings>
SETTINGS

my $out = 'court_vision_AI_prompt_sheet.docx';

sub slurp_bin { my $p = shift; open(my $fh, '<:raw', $p) or die "cannot read $p: $!"; local $/; my $d = <$fh>; close $fh; return $d; }
my $logo_bin = slurp_bin('../../Logos/Logo Skyrise Pro.png');
my $qr_bin   = slurp_bin('../QRCode.png');

my $z = IO::Compress::Zip->new($out, Name => '[Content_Types].xml', Method => ZIP_CM_DEFLATE) or die "Cannot create zip: $ZipError";
$z->print($content_types);
$z->newStream(Name => '_rels/.rels') or die $ZipError;            $z->print($rels);
$z->newStream(Name => 'word/document.xml') or die $ZipError;      $z->print($document_xml);
$z->newStream(Name => 'word/_rels/document.xml.rels') or die $ZipError; $z->print($doc_rels);
$z->newStream(Name => 'word/styles.xml') or die $ZipError;        $z->print($styles_xml);
$z->newStream(Name => 'word/settings.xml') or die $ZipError;      $z->print($settings_xml);
$z->newStream(Name => 'word/media/image1.png', Method => ZIP_CM_STORE) or die $ZipError; $z->print($logo_bin);
$z->newStream(Name => 'word/media/image2.png', Method => ZIP_CM_STORE) or die $ZipError; $z->print($qr_bin);
$z->close() or die $ZipError;

print "Created: $out\n";
print "Size: ", -s $out, " bytes\n";
