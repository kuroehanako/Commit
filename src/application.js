const { Gtk, Gio, GLib, GObject } = imports.gi

const SUMMARY = `Helps you write better Git commit messages.

To use, configure Git to use Gnomit as the default editor:

  git config --global core.editor <path-to-gnomit.js>`

const COPYRIGHT = `❤ We practice ethical design (https://ind.ie/ethical-design)

Copyright © 2018 Aral Balkan (https://ar.al)
Copyright © 2018 Ind.ie (https://ind.ie)

License GPLv3+: GNU GPL version 3 or later (http://gnu.org/licenses/gpl.html)
This is free software: you are free to change and redistribute it.
There is NO WARRANTY, to the extent permitted by law.`

const INSTALLATION_ERROR_SUMMARY = "\nError: failed to set Gnomit as your default Git editor.\n\n"

const HIGHLIGHT_BACKGROUND_TAG_NAME = 'highlightBackground'

// TODO: The Application class is doing everything right now. Refactor to offload
//       functionality to the dialogue and to helper objects.

var Application = GObject.registerClass({
  // Nothing yet.
}, class Application extends Gtk.Application {

  _init() {

    //
    // Set application details.
    //

    super._init({
      application_id: 'ind.ie.Gnomit',
      flags:
      /* We handle file opens. */
      Gio.ApplicationFlags.HANDLES_OPEN
      /* We can have more than one instance active at once. */
      | Gio.ApplicationFlags.NON_UNIQUE
    })

    GLib.set_prgname('Gnomit')
    GLib.set_application_name('Gnomit Commit Editor')

    //
    // Set command-line option handling.
    //

    // The option context parameter string is displayed next to the
    // list of options on the first line of the --help screen.
    this.set_option_context_parameter_string('<path-to-git-commit-message-file>')

    // The option context summary is displayed above the set of options
    // on the --help screen.
    this.set_option_context_summary(SUMMARY)

    // The option context description is displayed below the set of options
    // on the --help screen.
    this.set_option_context_description(COPYRIGHT)

    // Add option: --version, -v
    this.add_main_option(
      'version', 'v',
      GLib.OptionFlags.NONE,
      GLib.OptionArg.NONE,
      'Show version number and exit',
      null
    )

    // Add option: --install, -i
    this.add_main_option(
      'install', 'i',
      GLib.OptionFlags.NONE,
      GLib.OptionArg.NONE,
      'Install Gnomit as your default Git editor',
      null
    )

    //
    // Signal: Handle local options.
    //

    this.connect('handle_local_options', (application, options) => {
      // Handle option: --install, -i:
      //
      // Install Gnomit as your default Git editor.
      if (options.contains('install')) {
        try {
          let [success, standardOutput, standardError, exitStatus] = GLib.spawn_command_line_sync(`git config --global core.editor '/app/bin/ind.ie.Gnomit'`)

          if (!success || exitStatus !== 0) {
            // Error: Spawn successful but process did not exit successfully.
            print(`${INSTALLATION_ERROR_SUMMARY}${standardError}`)

            // Exit with generic error code.
            return 1
          }
        } catch (error) {
          // Error: Spawn failed.

          // Start off by telling the person what failed.
          let errorMessage = INSTALLATION_ERROR_SUMMARY

          // Provide further information and try to help.
          if (error.code === GLib.SpawnError.NOENT) {
            // Git was not found: show people how to install it.
            errorMessage += "Git is not installed.\n\nFor help on installing Git, please see:\nhttps://git-scm.com/book/en/v2/Getting-Started-Installing-Git\n"
          } else {
            // Some other error: show the error message.
            errorMessage += `${error}`
          }
          print (errorMessage)

          // Exit with generic error code.
          return 1
        }

        // OK.
        return 0
      }

      // Handle option: --version, -v:
      //
      // Print a minimal version string based on the GNU coding standards.
      // https://www.gnu.org/prep/standards/standards.html#g_t_002d_002dversion
      if (options.contains('version')) {
        print('Gnomit 1.0.0')

        // OK.
        return 0
      }

      // Let the system handle any other command-line options.
      return -1
    })

    //
    // Signal: Open.
    //

    // Open gets called when a file is passed as a command=line argument.
    // We expect Git to pass us one file.
    this.connect('open', (application, files, hint) => {
      if (files.length !== 1) {
        // Error: Too many files.
        this.activate()
        return
      }

      this.commitMessageFile = files[0]
      this.commitMessageFilePath = this.commitMessageFile.get_path()

      // Try to load the commit message contents.
      const ERROR_SUMMARY="\n\nError: Could not read the Git commit message file.\n\n"

      let success = false,
      commitMessage = '',
      commitBody = '',
      commitComment = '';

      try {
        [success, commitMessage] = GLib.file_get_contents(this.commitMessageFilePath)

        // Convert the message from ByteArray to String.
        commitMessage = commitMessage.toString()
        const commitMessageLines = commitMessage.split("\n")

        // Separate the comments section from any body content that there
        // may be (e.g., an auto-generated Merge message)
        if (commitMessage[1] === '#') {
          commitComment = `\n${commitMessage}`
        } else {
          // The first line is not a comment, it’s an autogenerated
          // message. Treat it as such.
          commitBody = `${commitMessageLines[0]}`
          commitMessageLines.shift()
          commitComment = `\n${commitMessageLines.join("\n")}`
        }

        // Save the number of lines in the original commit comment
        // so we have an easy way of calculating the non-comment
        // section of the commit message.
        const commitCommentLines = commitComment.split("\n")
        this.numberOfLinesInCommitComment = commitCommentLines.length

        // Set the title of the dialogue to ProjectFolderName (Branch):

        // The commit message is always in the .git directory in the
        // project directory. Get the project directory’s name by using this.
        const pathComponents = this.commitMessageFilePath.split('/')
        const projectDirectoryName = pathComponents[pathComponents.indexOf('.git') - 1]

        // Try to get the branch name via a method that relies on
        // positional aspect of the branch name so it should work with
        // other languages.
        const wordsOnBranchLine = commitCommentLines[5].split(" ")
        const branchName = wordsOnBranchLine[wordsOnBranchLine.length - 1]
        this.active_window.set_title(`${projectDirectoryName} (${branchName})`)

        // Add Pango markup to make the commented are appear lighter.
        commitMessage = `${commitBody}<span foreground="#959595">${commitComment}</span>`

        // Not sure when you would get success === false without an error being
        // thrown but handling it anyway just to be safe. There doesn’t appear
        // to be any error information available.
        // Docs: http://devdocs.baznga.org/glib20~2.50.0/glib.file_get_contents
        if (!success) {
          print(`${ERROR_SUMMARY}`)
          application.quit()
        }
      } catch (error) {
        print(`${ERROR_SUMMARY}${error}\n`)
        application.quit()
      }

      // Update the text in the interface using markup.
      let startOfText = this.buffer.get_start_iter()
      this.buffer.insert_markup(startOfText, commitMessage, -1)

      // The iterator now points to the end of the inserted section.
      // Reset it to either the start of the body of the commit message
      // (if there is one) or to the very start of the text and place the
      // cursor there, ready for person to start editing it.
      startOfText = commitBody.length > 0 ? this.buffer.get_iter_at_offset(commitBody.length) : this.buffer.get_start_iter()
      this.buffer.place_cursor(startOfText)

      // Set the original comment to be non-editable.
      const nonEditableTag = Gtk.TextTag.new('NonEditable')
      nonEditableTag.editable = false
      this.buffer.tag_table.add(nonEditableTag)
      const endOfText = this.buffer.get_end_iter()
      this.buffer.apply_tag(nonEditableTag, startOfText, endOfText)

      // Save the number of lines in the commit message.
      this.previousNumberOfLinesInCommitMessage = 1

      // Show the composition interface.
      this.dialogue.show_all()
    })

    //
    // Signal: Activate
    //

    this.activate = () => {
      // Activate is only called if there are no file(s) passed to
      // Gnomit. As Gnomit should only be run by Git, and since Git
      // always passes the commit file, we can assume if activate is
      // triggered that someone ran Gnomit directly and
      // without a commit message file as an argument, we show the help.
      //
      // This is a faff-and-a-half when using the simple signals-based
      // approach to handling command-line arguments (in our case HANDLES_OPEN),
      // as there is no way to get a reference to the GOptionContext of the
      // main application to invoke its get_help() method.
      //
      // TODO: File an enhancement request about this with the GTK project.
      //
      // So, instead, as a workaround, I’m spawning another instance of
      // the app with the --help flag set and piping the output.

      try {
        let [success, standardOutput, standardError, exitStatus] = GLib.spawn_command_line_sync('/app/bin/ind.ie.Gnomit --help')

        if (success) {
          print(standardOutput)
        } else {
          print(standardError)
        }
      } catch (error) {
        print (error)
      }

      this.quit()
    }

    this.connect('activate', this.activate)

  }
})