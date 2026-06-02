#!/usr/bin/perl
use strict;
use warnings;
use IO::Compress::Zip qw(zip $ZipError :zip_method);

# ── helpers ──────────────────────────────────────────────────────────────────

sub esc { my $t = shift; $t =~ s/&/&amp;/g; $t =~ s/</&lt;/g; $t =~ s/>/&gt;/g; $t =~ s/"/&quot;/g; return $t; }

sub run {
    my ($text, %o) = @_;
    my $rpr = '<w:rPr>';
    $rpr .= '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>';
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
    if ($o{border_left}) {
        $ppr .= '<w:pBdr><w:left w:val="single" w:sz="16" w:space="4" w:color="' . $o{border_left} . '"/></w:pBdr>';
    }
    if ($o{shading}) {
        $ppr .= '<w:shd w:val="clear" w:color="auto" w:fill="' . $o{shading} . '"/>';
    }
    if ($o{indent}) {
        $ppr .= '<w:ind w:left="' . $o{indent} . '" w:right="' . $o{indent} . '"/>';
    }
    $ppr .= '</w:pPr>';
    return "<w:p>$ppr$content</w:p>\n";
}

sub gap {
    my $pts = shift || 200;
    return para('', before => $pts, after => 0);
}

sub rule {
    return para('', before => 200, after => 200, border_bottom => 1);
}

sub heading {
    my ($text, %o) = @_;
    my $color = $o{color} || '0A0F1E';
    my $sz    = $o{sz}    || 32;
    my $r = run($text, bold => 1, sz => $sz, color => $color);
    return para($r, before => 340, after => 140);
}

sub section_label {
    my ($text, %o) = @_;
    my $color = $o{color} || 'FF6B35';
    my $r = run(uc($text), bold => 1, sz => 18, color => $color, spacing => 60);
    return para($r, before => 0, after => 80);
}

sub body_para {
    my ($text, %o) = @_;
    my $color = $o{color} || '0A0F1E';
    my $r = run($text, sz => 21, color => $color, italic => $o{italic}, bold => $o{bold});
    return para($r, before => 80, after => 80, shading => $o{shading}, border_left => $o{border_left}, indent => $o{indent});
}

sub italic_para {
    my ($text) = @_;
    my $r = run($text, sz => 20, color => '555555', italic => 1);
    return para($r, before => 60, after => 60);
}

sub page_break {
    return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>\n";
}

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

sub act_label {
    my ($text) = @_;
    my $r = run($text, bold => 1, sz => 20, color => '00C8E8', spacing => 300);
    return para($r, before => 0, after => 40);
}

# ── cell helper ─────────────────────────────────────────────────────────────

sub cell {
    my ($content_xml, $width, %o) = @_;
    my $fill  = $o{fill}  || 'FFFFFF';
    my $bclr  = $o{bclr}  || 'D0E8F0';
    my $bdr = "<w:tcBorders>" .
              "<w:top w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "<w:left w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "<w:bottom w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "<w:right w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"$bclr\"/>" .
              "</w:tcBorders>";
    my $shd = "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"$fill\"/>";
    my $mar = "<w:tcMar><w:top w:w=\"80\" w:type=\"dxa\"/><w:left w:w=\"120\" w:type=\"dxa\"/><w:bottom w:w=\"80\" w:type=\"dxa\"/><w:right w:w=\"120\" w:type=\"dxa\"/></w:tcMar>";
    return "<w:tc><w:tcPr><w:tcW w:w=\"$width\" w:type=\"dxa\"/>$bdr$shd$mar</w:tcPr>$content_xml</w:tc>";
}

sub hdr_cell {
    my ($text, $width) = @_;
    my $p = para(run($text, bold=>1, sz=>18, color=>'00C8E8', spacing=>60), before=>0, after=>0);
    return cell($p, $width, fill=>'0A0F1E', bclr=>'00C8E8');
}

sub tbl {
    my ($total_w, $col_widths, $rows_xml) = @_;
    my $cols = join('', map { "<w:gridCol w:w=\"$_\"/>" } @$col_widths);
    return "<w:tbl>" .
           "<w:tblPr><w:tblW w:w=\"$total_w\" w:type=\"dxa\"/>" .
           "<w:tblBorders><w:insideH w:val=\"single\" w:sz=\"1\" w:color=\"D0E8F0\"/><w:insideV w:val=\"single\" w:sz=\"1\" w:color=\"D0E8F0\"/></w:tblBorders>" .
           "</w:tblPr>" .
           "<w:tblGrid>$cols</w:tblGrid>$rows_xml</w:tbl>\n";
}

sub row {
    my @cells = @_;
    return "<w:tr>" . join('', @cells) . "</w:tr>";
}

# ── scene table ─────────────────────────────────────────────────────────────

sub scene_hdr {
    return row(
        hdr_cell('SHOT', 1300),
        hdr_cell('DESCRIPTION', 5200),
        hdr_cell('CAMERA / AUDIO NOTES', 2860),
    );
}

sub shot_row {
    my ($shot, $desc, $notes) = @_;
    my $c1 = cell(para(run($shot, bold=>1, sz=>18, color=>'0A0F1E'), before=>0,after=>0), 1300, fill=>'D5E8F0');
    my $c2 = cell(para(run($desc, sz=>19, color=>'0A0F1E'), before=>0,after=>0), 5200, fill=>'FFFFFF');
    my $c3 = cell(para(run($notes, sz=>18, color=>'664422', italic=>1), before=>0,after=>0), 2860, fill=>'FFF4EF');
    return row($c1, $c2, $c3);
}

sub scene_tbl {
    my @shots = @_;
    my $rows = scene_hdr() . join('', map { shot_row(@$_) } @shots);
    return tbl(9360, [1300, 5200, 2860], $rows);
}

# ── spec table ───────────────────────────────────────────────────────────────

sub spec_row {
    my ($label, $detail) = @_;
    my $c1 = cell(para(run($label, bold=>1, sz=>19, color=>'0A0F1E'), before=>0,after=>0), 3000, fill=>'D5E8F0');
    my $c2 = cell(para(run($detail, sz=>19, color=>'0A0F1E'), before=>0,after=>0), 6360, fill=>'FFFFFF');
    return row($c1, $c2);
}

sub spec_tbl {
    my @specs = @_;
    my $hdr = row(
        hdr_cell('SPECIFICATION', 3000),
        hdr_cell('DETAIL', 6360),
    );
    my $rows = $hdr . join('', map { spec_row(@$_) } @specs);
    return tbl(9360, [3000, 6360], $rows);
}

# ── player table ─────────────────────────────────────────────────────────────

sub player_row {
    my ($pos, $role, $id) = @_;
    my $c1 = cell(para(run($pos, bold=>1, sz=>19, color=>'0A0F1E'), before=>0,after=>0), 2200, fill=>'D5E8F0');
    my $c2 = cell(para(run($role, bold=>1, sz=>19, color=>'FF6B35'), before=>0,after=>0), 2200, fill=>'FFFFFF');
    my $c3 = cell(para(run($id, sz=>18, color=>'0A0F1E'), before=>0,after=>0), 4960, fill=>'FFFFFF');
    return row($c1, $c2, $c3);
}

# ── card table ───────────────────────────────────────────────────────────────

sub card_row {
    my ($label, $desc, $text) = @_;
    my $c1 = cell(para(run($label, bold=>1, sz=>18, color=>'0A0F1E'), before=>0,after=>0), 1800, fill=>'D5E8F0');
    my $c2 = cell(para(run($desc, sz=>18, color=>'555555', italic=>1), before=>0,after=>0), 3000, fill=>'FFFFFF');
    my $c3 = cell(para(run($text, bold=>1, sz=>18, color=>'0A0F1E'), before=>0,after=>0), 4560, fill=>'FFFFFF');
    return row($c1, $c2, $c3);
}

# ── document body ────────────────────────────────────────────────────────────

my $body = '';

# COVER
$body .= gap(1200);
$body .= image_para('rId3', 3429000, 1929375, 'SkyriseLogo');  # 3.75in wide, 16:9
$body .= gap(160);
$body .= para(run('PRESENTS', bold=>1, sz=>20, color=>'00C8E8', spacing=>300), align=>'center', before=>0, after=>80);
$body .= gap(300);
$body .= para(run('  COURT VISION  ', bold=>1, sz=>72, color=>'0A0F1E'), align=>'center', before=>0, after=>0, border_bottom=>0);

# Manual title with top/bottom border via shading box approach
{
    my $r = run('COURT VISION', bold=>1, sz=>72, color=>'0A0F1E');
    my $ppr = '<w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/><w:pBdr><w:top w:val="single" w:sz="12" w:space="1" w:color="FF6B35"/><w:bottom w:val="single" w:sz="12" w:space="1" w:color="FF6B35"/></w:pBdr></w:pPr>';
    $body .= "<w:p>$ppr$r</w:p>\n";
}

$body .= gap(200);
$body .= para(run('A Cinematic Brand Film', sz=>28, color=>'555555', italic=>1), align=>'center', before=>0, after=>80);
$body .= para(run('Commercial Real Estate  |  Commercial Construction  |  Skyrise Pro', sz=>20, color=>'00C8E8'), align=>'center', before=>0, after=>0);
$body .= gap(240);
$body .= para(run('RUNTIME: 1:30 MAX', bold=>1, sz=>22, color=>'FF6B35', spacing=>200), align=>'center', before=>0, after=>0);
$body .= gap(500);
$body .= para(run('PRODUCTION TREATMENT & SHOT BREAKDOWN', bold=>1, sz=>18, color=>'888888', spacing=>120), align=>'center', before=>0, after=>60);
$body .= para(run('Version 1.0   Skyrise Pro Creative Division', sz=>18, color=>'888888'), align=>'center', before=>0, after=>0);
$body .= page_break();

# ── LOGLINE ──────────────────────────────────────────────────────────────────
$body .= heading('THE STORY IN ONE LINE', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);
$body .= body_para('Five men who build cities by day find their ultimate rhythm on the basketball court where every pass is a trust fall, every play mirrors a deal, and the buzzer-beater belongs to the landlord who put it all together.',
    italic=>1, bold=>1, sz=>24, color=>'0A0F1E', shading=>'E8F4FB', border_left=>'FF6B35', indent=>360);
$body .= gap(200);

# ── BRAND PHILOSOPHY ─────────────────────────────────────────────────────────
$body .= heading('BRAND PHILOSOPHY', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);
$body .= body_para('Skyrise Pro exists to honor the work. Every project — from first meeting to final close — is living proof of what a team is capable of. This film is that proof in motion. It is not a commercial. It is a declaration.');
$body .= gap(80);
$body .= body_para('The basketball court is a metaphor the market already understands: court vision, court IQ, the ability to see three moves ahead. These are the same skills that separate elite deal-makers from the rest. This film fuses both worlds without apology.');
$body .= gap(200);

# ── PLAYERS ──────────────────────────────────────────────────────────────────
$body .= heading('THE PLAYERS — CHARACTER BREAKDOWN', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);

{
    my $hdr = row(
        hdr_cell('POSITION', 2200),
        hdr_cell('REAL-WORLD ROLE', 2200),
        hdr_cell('FILM IDENTITY', 4960),
    );
    my @players = (
        ['Point Guard', 'Leasing Agent', 'The floor general — modeled on Magic Johnson. He knows where all four teammates are without looking. No-look passes, eyes downcourt while the ball goes sideways. He sees the whole floor at once — the play two steps before it happens. Without him, there is no deal flow.'],
        ['Power Forward', 'Landlord / Project Manager', 'The finisher and the hub. He funded the court. He plays a dual role — Owner reviewing the deal, then Project Manager reviewing the proposal — so the ball keeps coming back to him on the give-and-go. He takes the last shot. When the clock is dying, the ball finds him.'],
        ['Small Forward', 'Architect', 'Fluid and creative. Reads angles others miss. His passes are works of art. On the court and on the blueprints, beauty is function.'],
        ['Shooting Guard', 'Engineer', 'Precision in motion. Every move is calculated. He does not rush — he solves. When he catches the ball, you know it is going somewhere with purpose.'],
        ['Center', 'General Contractor', 'Physical. Relentless. Drives the lane without hesitation. He builds the structure of every play, just like every building he manages. The Inspector cannot stop him.'],
        ['Defender (Villain)', 'Inspector', 'Arrives mid-play to disrupt. Tries to steal the ball but gets humiliated by the crossover. He is not a bad actor — he is a necessary one. He makes the team sharper.'],
    );
    my $rows = $hdr . join('', map { player_row(@$_) } @players);
    $body .= tbl(9360, [2200, 2200, 4960], $rows);
}

$body .= gap(200);
$body .= page_break();

# ── ACT I ────────────────────────────────────────────────────────────────────
$body .= act_label('ACT I');
$body .= heading('THE MEETING OF MINDS — Downtown NYC', sz=>34, color=>'0A0F1E');
$body .= rule();
$body .= italic_para('DURATION: 0:00 — 0:16  |  TONE: Cinematic, aspirational, golden-hour grit');
$body .= gap(100);

$body .= scene_tbl(
    ['01 — AERIAL', 'Drone push-in over the Manhattan skyline at dusk. Glass towers catch the last light. The city hums. We descend slowly toward a commercial corridor — buildings mid-construction, cranes silhouetted against orange sky.', 'Drone / 4K aerial. Golden hour. Score builds from silence — single low piano note.'],
    ['02 — WIDE', 'Street level. Five men in sharp charcoal, navy, and slate-grey suits converge at a single point between two glass towers. No briefcases. Just presence. They stand the way men stand when they have already won — loose, unhurried, certain.', 'Anamorphic wide lens. Backlit. City noise fades beneath score.'],
    ['03 — CLOSE', 'Slow push on each man\'s face. Eyes surveying the towers, surveying each other. This is not small talk. This is strategy without words.', 'Close-up rack focus. Each man gets 2 seconds.'],
    ['04 — OVERHEAD', 'Looking straight down: five men in a pentagon formation on the pavement. The city\'s grid stretches in every direction. They are the center of it.', 'Drone directly overhead. Holds 3 seconds. Music swells one beat.'],
    ['05 — MED', 'The Leasing Agent looks down the street — a subtle nod toward where they\'re headed. No words. The others catch it immediately. Jackets loosened. Ties undone. A collective exhale — the shift begins.', 'Medium shot. Natural ambient sound bleeds in briefly — traffic, wind. Then cut.'],
);

$body .= gap(200);

# ── ACT II PART 1 ────────────────────────────────────────────────────────────
$body .= act_label('ACT II — PART ONE');
$body .= heading('THE TUNNEL — The Transformation', sz=>34, color=>'0A0F1E');
$body .= rule();
$body .= italic_para('DURATION: 0:16 — 0:38  |  TONE: Momentum, pulse-building, kinetic energy');
$body .= gap(100);

$body .= scene_tbl(
    ['06 — LOW ANGLE', 'The five men break into a jog in unison. Suits still on. Shoes still polished. But something is different — they move with athletic fluidity, not boardroom stiffness. The city blurs around them.', 'Low stabilized tracking shot from the front. Score shifts to percussion. Bass drum every other step.'],
    ['07 — TUNNEL ENTRY', 'They enter a long tunnel — concrete walls, fluorescent light ahead, darkness behind. Their shadows multiply. The acoustics change: their footsteps echo with weight.', 'Medium tracking shot from behind. Sound design: footstep echo layered under score.'],
    ['08 — SLOW MO BURST', 'As they accelerate through the tunnel — THE REVEAL. The Leasing Agent rips his suit jacket off from the shoulders with one motion: underneath, a clean basketball jersey. The others follow — each man tearing away his suit like a warm-up shell.', 'Slow motion 120fps. One man at a time — rapid cuts: 0.5 sec each. Fabric flying, suits left on tunnel floor.'],
    ['09 — DETAIL', 'Suits hit the tunnel floor in slow motion — fabric settling like fallen empires. A tie drifts across the frame. The polished shoes are gone; sneakers grip the concrete.', 'Extreme close-up. Music pauses on this beat — a single breath of silence before the eruption.'],
    ['10 — HERO SHOT', 'Five men explode out of the tunnel end in full basketball gear. Light floods the frame. They are transformed. They do not slow down.', 'Wide shot from inside the gym looking back toward tunnel exit. Backlit silhouettes. Score DROPS: hard beat, full production.'],
);

$body .= gap(200);

# ── ACT II PART 2 ────────────────────────────────────────────────────────────
$body .= page_break();
$body .= act_label('ACT II — PART TWO');
$body .= heading('COURT VISION — The Play', sz=>34, color=>'0A0F1E');
$body .= rule();
$body .= italic_para('DURATION: 0:38 — 1:10  |  TONE: Elite, surgical, cinematic. Every pass is a stage of the deal.');
$body .= gap(80);
$body .= body_para('The court is pristine. Hardwood gleaming. High vaulted ceilings — the same premium facility from the reference image. Glass walls, skylights, almost sacred. A referee steps to center court. No scoreboard. No opponent. Just the game.');
$body .= gap(80);
$body .= body_para('This is the heart of the film: COURT VISION the way Magic Johnson played it. The Point Guard never stares down his target. His eyes are always somewhere else — looking off one defender while the ball goes to another. He knows where every teammate is before they get there. The passes are no-look, instinctive, telepathic. The audience should feel the same thing scouts felt watching Magic: how did he SEE that?', bold=>1, shading=>'E8F4FB', border_left=>'00C8E8', indent=>360);
$body .= gap(80);
$body .= body_para('EVERY PASS IS A STAGE OF THE DEAL. The ball does not just move forward — it moves the way a real commercial deal moves, including the give-and-go back to the hub. LOI signed (Leasing Agent) to Owner Review (Landlord) to Pre-Con Bids (Contractor), then BACK to the Landlord as Project Manager for Proposal Review, then BACK to the Leasing Agent for Lease Follow-Up & Signing — and only then does the design-build phase break open: Architect to Engineer to Contractor. A lower-third names each deal stage as the ball arrives. That is the whole point: court vision IS deal vision.', bold=>1, shading=>'FFF4EF', border_left=>'FF6B35', indent=>360);
$body .= gap(80);
$body .= italic_para('Tip-off. The ball hangs in the air. Silence for one frame. Then — GAME ON.');
$body .= gap(100);

$body .= scene_tbl(
    ['11 — JUMP BALL', 'Referee tosses. The ball rises in slow motion against the vaulted ceiling. Two hands reach upward. The Point Guard (Leasing Agent) taps it — controlled, deliberate. The court comes alive.', 'Low angle looking up at ball. 120fps. Score builds under silence. First SNEAKER SQUEAK as players plant and cut — sharp, alive.'],
    ['12 — PASS 1', 'LEASING AGENT to LANDLORD. Pure Magic Johnson — the Leasing Agent drives left looking the other way, eyes locked downcourt, then whips a NO-LOOK skip pass to the Landlord. He never saw the ball; he already knew where the Landlord would be.', 'Lower-third: "LOI SIGNED -> OWNER REVIEW". Overhead camera tracks ball. Hold on his eyes looking away. AUDIO: sneaker squeak on the plant + crisp ball snap into hands.'],
    ['13 — PASS 2', 'LANDLORD to CONTRACTOR. The Landlord (Owner) catches, surveys, and threads a sharp bounce pass to the General Contractor at the top of the key. The scope is in motion.', 'Lower-third: "PRE-CON BIDS". Tight tracking. AUDIO: the bounce-pass thud off hardwood + squeak as the GC sets up.'],
    ['14 — PASS 3 (give-and-go)', 'CONTRACTOR back to LANDLORD/PM. The Contractor immediately kicks it BACK to the Landlord — now wearing the Project Manager hat — who reviews the bid. The give-and-go: the ball returns to the hub. This is the read most people miss.', 'Lower-third: "PROPOSAL REVIEW (PM)". Slow-mo on the return pass. AUDIO: quick double-squeak as both men reset their feet.'],
    ['15 — PASS 4 (give-and-go)', 'LANDLORD/PM back to LEASING AGENT. Proposal approved, the Landlord swings it BACK across to the Leasing Agent, who closes the loop — lease follow-up and final signing. The deal is fully executed. NOW the build can begin.', 'Lower-third: "LEASE FOLLOW-UP & SIGNING". Wide give-and-go across the floor. AUDIO: crisp pass snap + squeak as the Agent catches and pivots upcourt.'],
    ['16 — PASS 5', 'LEASING AGENT to ARCHITECT. With the lease signed, the Agent ignites the design phase — a slick dish to the Architect cutting baseline. The play opens up.', 'Lower-third: "DESIGN BEGINS". Side-angle slow motion. AUDIO: stutter-step squeak as the Architect plants.'],
    ['17 — PASS 6', 'ARCHITECT to ENGINEER. The Architect receives and in one fluid motion redirects to the Engineer spotting up at the elbow. The play unfolds exactly as designed.', 'Lower-third: "ENGINEERING". Quick touch pass, slow motion. AUDIO: short squeak as the Engineer squares up.'],
    ['18 — PASS 7', 'ENGINEER to CONTRACTOR. The Engineer pivots and lobs a high-arcing pass to the Contractor driving hard down the lane. The Contractor catches in stride. Ground breaks.', 'Lower-third: "CONSTRUCTION". Low angle tracking the drive. AUDIO: hard squeak on the pivot + driving footfalls and dribble echo down the lane.'],
);

$body .= gap(200);

# ── THE CROSSOVER ────────────────────────────────────────────────────────────
$body .= heading('THE INSPECTOR — The Crossover', sz=>34, color=>'0A0F1E');
$body .= rule();
$body .= italic_para('DURATION: 1:10 — 1:18  |  TONE: Tension, explosive, dominance. The crowd leans in.');
$body .= gap(100);

$body .= scene_tbl(
    ['19 — INTRUSION', 'The Inspector enters the frame from the sideline. Clipboard in hand briefly — then tossed aside. He squares up on the Contractor driving the lane. This is a man who has made careers uncomfortable. He reaches for the ball.', 'Lower-third: "FINAL INSPECTION". Score drops to sparse bass. AUDIO: low defensive shuffle squeaks as he slides into position.'],
    ['20 — CROSSOVER', 'The Contractor hesitates — then EXPLODES: a between-the-legs crossover that puts the Inspector on skates. The Inspector stumbles, reaching air. A beat of reluctant respect. The crowd is on its feet.', 'Ultra slow motion 240fps on the crossover. AUDIO (the hero squeak): one LOUD sneaker screech as the Inspector\'s planted foot slips — the sound of getting broken down. Isolated, no music.'],
);

$body .= gap(200);
$body .= page_break();

# ── ACT III ──────────────────────────────────────────────────────────────────
$body .= act_label('ACT III');
$body .= heading('THE BUZZER BEATER — The Close', sz=>34, color=>'0A0F1E');
$body .= rule();
$body .= italic_para('DURATION: 1:18 — 1:30  |  TONE: Mythic. Everything has led to this moment.');
$body .= gap(100);

$body .= scene_tbl(
    ['21 — PASS BACK', 'The Contractor, past the Inspector, kicks it back to the Landlord at half court — the Project Manager taking the final possession. The Landlord catches it. Everything slows.', 'Lower-third: "C OF O CLEARED". Wide shot. Motion slows to 60fps. Score fades. AUDIO: one last squeak as the Landlord sets his feet, then crowd ambience — a held breath.'],
    ['22 — CLOCK', 'Insert shot: scoreboard clock ticking down. 0:05 — 0:04 — 0:03. The numbers fill the frame.', 'Close-up insert. Red digits. Score ticks with the clock.'],
    ['23 — THE SHOT', 'The Landlord rises from half court. His form is everything a project handoff should be: deliberate, committed, irreversible. The ball leaves his fingertips. He holds the follow-through.', 'Lower-third: "RENT COMMENCEMENT". Extreme slow motion from three angles: face-on, side, low angle. Score holds a single sustained note.'],
    ['24 — THE ARC', 'The ball travels in a perfect arc across the full length of the court. The ceiling lights trace its path. The gym is silent except for the rotation of the ball in flight.', 'Ball POV. Steadicam tracking. The net visible in the distance, growing larger.'],
    ['25 — THE SWISH', 'NOTHING BUT NET. The ball drops through the rim without touching it. A swish so clean it echoes. The buzzer fires exactly as it passes through.', 'Ultra slow motion net ripple, 240fps. Sound design: the swish, the buzzer, then — ONE BEAT OF SILENCE before the crowd erupts.'],
    ['26 — THE ERUPTION', 'The crowd sound hits like a wall. The five men on the court exchange looks — not surprise. Recognition. They knew. They always knew.', 'Wide shot of all five. Arms raised. The court alive with light. Score returns full: triumphant, cinematic.'],
);

$body .= gap(200);

# ── CLOSING TITLES ───────────────────────────────────────────────────────────
$body .= heading('CLOSING TITLE SEQUENCE', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);
$body .= body_para('The final sequence holds on the court. Five men. One ball on the ground between them. The city visible through the glass walls in the background. Then the cards:');
$body .= gap(100);

{
    my @cards = (
        ['CARD 01', 'Black frame. White text:', '"Every great project starts with a meeting of minds."'],
        ['CARD 02', 'Black frame. Cyan text:', '"Every great team deserves to see what they built."'],
        ['CARD 03', 'Skyrise Pro logo fades in. Below it:', 'AUTOMATE THE WORKFLOW. HONOR THE WORK.'],
        ['CARD 04', 'URL / CTA:', 'skyrisepro.com'],
    );
    my $hdr = row(hdr_cell('CARD', 1800), hdr_cell('CONTEXT', 3000), hdr_cell('TEXT', 4560));
    my $rows = $hdr . join('', map { card_row(@$_) } @cards);
    $body .= tbl(9360, [1800, 3000, 4560], $rows);
}

$body .= gap(200);
$body .= page_break();

# ── MUSIC & SOUND ────────────────────────────────────────────────────────────
$body .= heading('MUSIC & SOUND DESIGN', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);

my @music_sections = (
    ['ACT I — THE MEETING', 'Cinematic orchestral. Sparse piano, building strings. Think Hans Zimmer meeting Kendrick Lamar\'s "Alright" instrumental. The city has weight. The men have purpose.'],
    ['ACT II — THE TUNNEL', 'Hard transition: percussion drops the moment suits start flying. Bass-heavy, trap-influenced cinematic score — not rap, but rap energy translated to orchestra. Pulse equals footsteps. Every beat synchronized to motion.'],
    ['COURT VISION', 'Score becomes layered: orchestral strings over the beat. Each pass is a musical event — a soft horn hit, a string pluck, a percussion snap. The music IS the court vision.'],
    ['SNEAKERS ON HARDWOOD (signature)', 'NON-NEGOTIABLE TEXTURE. Every cut, plant, and pivot during the play carries a crisp, close-mic\'d sneaker squeak on hardwood — the unmistakable sound of real basketball. Mix it loud and present, sitting on top of the score, never buried. The squeaks are the percussion of the court-vision sequence; they make it feel REAL. Source authentic court recordings, not stock.'],
    ['THE CROSSOVER', 'Score isolates to bass. Sparse. The crossover happens in near-silence — except for ONE loud, isolated sneaker screech as the Inspector slips. That squeak IS the punchline. One percussive hit as the crowd would react.'],
    ['THE SHOT', 'Single sustained cello note. Everything else drops. The ball in flight: only ambient room tone and the note. When it swishes: silence (1 second). Then the buzzer. Then the crowd erupts simultaneously with the full score dropping in.'],
    ['CROWD SFX', 'Real NBA arena crowd sample or original recording. Layered: initial gasp, then explosion of sound. Hold the cheer through the final beat. Fade to music-only for the logo card.'],
);

for my $s (@music_sections) {
    $body .= section_label($s->[0]);
    $body .= body_para($s->[1]);
    $body .= gap(80);
}

$body .= rule();
$body .= gap(200);

# ── VISUAL LANGUAGE ──────────────────────────────────────────────────────────
$body .= heading('VISUAL LANGUAGE & STYLE', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);

my @visual_sections = (
    ['COLOR GRADING', 'Teal-and-orange blockbuster grade. Warm skin tones. Cool shadows. The court hardwood glows amber. The glass walls carry a cool cyan tint — consistent with the Skyrise Pro brand palette.'],
    ['LENS CHOICE', 'Anamorphic throughout. Lens flares are permitted — earned, not decorative. Wide establishing shots contrast tight face-level inserts: the scale of the city vs. the intimacy of the men who build it.'],
    ['TITLE CARDS', 'Minimal. White sans-serif on near-black. Each character\'s name appears as a clean lower-third at the moment they receive the ball. Snap on, snap off. No animation flourishes. Authority.'],
    ['SLOW MOTION', 'Used surgically: the suit-tear, the crossover, and the shot. Three moments. No more. Overuse kills impact.'],
    ['ASPECT RATIO', 'Shoot in 2.39:1 (scope). The cinematic bars honor the subject. These men and this work deserve a wide canvas.'],
);

for my $s (@visual_sections) {
    $body .= section_label($s->[0]);
    $body .= body_para($s->[1]);
    $body .= gap(80);
}

$body .= gap(200);
$body .= page_break();

# ── PRODUCTION SPECS ─────────────────────────────────────────────────────────
$body .= heading('PRODUCTION SPECIFICATIONS', sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);

$body .= spec_tbl(
    ['Total Runtime', '1:30 MAXIMUM (hard cap) — main film  |  :30 and :15 cuts for social/ads'],
    ['Timecode Map', 'Act I Meeting 0:00-0:16  |  Tunnel 0:16-0:38  |  Court Vision 0:38-1:08  |  Crossover 1:08-1:18  |  Buzzer Beater 1:18-1:30'],
    ['Primary Locations', 'Downtown NYC commercial district (Act I) + Premium indoor basketball facility (Acts II-III)'],
    ['Cast', '5 principals (Leasing Agent, Landlord, Architect, Engineer, Contractor) + 1 referee + 1 Inspector'],
    ['Wardrobe', 'Custom tear-away suits over full basketball uniforms. Suits must break cleanly at shoulder seams on a single pull.'],
    ['Camera Package', 'RED Monstro or ARRI ALEXA Mini LV + Anamorphic lenses. Drone unit for aerials.'],
    ['High Speed Camera', 'Phantom Flex 4K for 240fps slowmo sequences (crossover, swish)'],
    ['Shoot Days', 'Est. 2 days: Day 1 — NYC exteriors + tunnel. Day 2 — Basketball court interior.'],
    ['Deliverables', '1:30 brand film (master) / 30s cut / 15s social cut / still frames for web use'],
    ['Brand Integration', 'Skyrise Pro logo appears once — on the closing title card only. The film earns the logo; it does not announce it.'],
);

$body .= gap(200);

# ── DIRECTOR'S NOTE ──────────────────────────────────────────────────────────
$body .= heading("DIRECTOR'S NOTE", sz=>30, color=>'0A0F1E');
$body .= rule();
$body .= gap(80);
$body .= body_para('This film is not about basketball. It is about what happens when people who are extraordinary at what they do find each other — and choose to move as one. The court is just the language we use to say that clearly. Every pass is a handoff. Every read is a trust earned. Every buzzer beater is a project delivered on time, on budget, against the clock, with everything on the line. Skyrise Pro did not just build a platform. It built the infrastructure for teams like this to exist and be seen. This film is the proof.',
    color=>'FFFFFF', shading=>'0A0F1E', border_left=>'00C8E8', indent=>360, italic=>1);

$body .= gap(400);
$body .= para(run('SKYRISE PRO — AUTOMATE THE WORKFLOW. HONOR THE WORK.', bold=>1, sz=>20, color=>'00C8E8', spacing=>150), align=>'center', before=>0, after=>60);
$body .= gap(200);
$body .= image_para('rId4', 1143000, 1143000, 'SkyriseQR');  # 1.25in square
$body .= para(run('Scan to visit skyrisepro.com', sz=>16, color=>'888888', spacing=>40), align=>'center', before=>80, after=>0);

# ── WRAP BODY ────────────────────────────────────────────────────────────────
my $document_xml = <<'DOCHEAD';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
<w:body>
DOCHEAD

$document_xml .= $body;
$document_xml .= <<'DOCTAIL';
<w:sectPr>
  <w:pgSz w:w="12240" w:h="15840"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
           w:header="720" w:footer="720" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>
DOCTAIL

# ── OTHER XML FILES ──────────────────────────────────────────────────────────

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
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
    </w:rPr>
  </w:style>
</w:styles>
STYLES

my $settings_xml = <<'SETTINGS';
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>
SETTINGS

# ── WRITE DOCX ───────────────────────────────────────────────────────────────

my $out = 'court_vision_treatment.docx';

# read image binaries
my $logo_path = '../../Logos/Logo Skyrise Pro.png';
my $qr_path   = '../QRCode.png';
sub slurp_bin { my $p = shift; open(my $fh, '<:raw', $p) or die "cannot read $p: $!"; local $/; my $d = <$fh>; close $fh; return $d; }
my $logo_bin = slurp_bin($logo_path);
my $qr_bin   = slurp_bin($qr_path);

my $z = IO::Compress::Zip->new(
    $out,
    Name   => '[Content_Types].xml',
    Method => ZIP_CM_DEFLATE,
) or die "Cannot create zip: $ZipError";

$z->print($content_types);

$z->newStream(Name => '_rels/.rels') or die $ZipError;
$z->print($rels);

$z->newStream(Name => 'word/document.xml') or die $ZipError;
$z->print($document_xml);

$z->newStream(Name => 'word/_rels/document.xml.rels') or die $ZipError;
$z->print($doc_rels);

$z->newStream(Name => 'word/styles.xml') or die $ZipError;
$z->print($styles_xml);

$z->newStream(Name => 'word/settings.xml') or die $ZipError;
$z->print($settings_xml);

$z->newStream(Name => 'word/media/image1.png', Method => ZIP_CM_STORE) or die $ZipError;
$z->print($logo_bin);

$z->newStream(Name => 'word/media/image2.png', Method => ZIP_CM_STORE) or die $ZipError;
$z->print($qr_bin);

$z->close() or die $ZipError;

print "Created: $out\n";
print "Size: ", -s $out, " bytes\n";
