-- Post-its: the new columns (tags, color, w, h) come from the manifest. The tag of a note
-- becomes its first tag, and every existing note gets the default colour.
update notes set tags = '["' || tag || '"]' where tags is null and tag is not null;
update notes set color = 'yellow' where color is null;
